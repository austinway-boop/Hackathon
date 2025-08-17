class GameManager {
    constructor() {
        this.isFullscreen = false;
        this.clouds = [];
        this.pots = [];
        this.gameState = null;
        this.currentMoney = 100; // Starting money - will be updated from API
        this.plantData = this.initializePlantData();
        this.modifierData = this.initializeModifierData();
        this.playerInventory = [
            { id: 1, name: 'Beanstalk', type: 'seed', rarity: 'common', quantity: 1, image: 'Assets/PlantSeeds/Beanstalkseeds.png' }
        ];
        this.isInventoryOpen = false;
        this.isShopOpen = false;
        this.shopInventory = [];
        this.shopData = null; // Current shop data from API
        this.shopTimer = null; // Shop refresh timer interval
        this.notificationShown = { twoMinute: false, oneMinute: false }; // Track shown notifications
        this.isDragging = false;
        this.draggedItem = null;
        this.dragElement = null;
        this.hoveredPot = null;
        this.growingPlants = new Map(); // Track growing plants by pot index
        this.seedTooltip = null; // For seed tooltips
        this.pendingPurchase = null; // Track current purchase being considered
        this.pendingBurn = null; // Track current burn being considered
        this.moneySyncTimeout = null; // For debounced money syncing
        
        // Level System
        this.currentLevel = 1;
        this.currentXP = 0;
        this.baseXPRequirement = 1000; // XP needed for level 2
        this.fireUnlocked = false; // Fire burn tool unlocked at level 3
        
        // Tutorial System
        this.tutorialActive = false;
        this.tutorialStep = 0;
        this.tutorialData = {
            beansCollected: 0,
            seedsPurchased: 0,
            plantsPlanted: 0,
            inventoryOpened: false,
            silverBeansCollected: 0,
            goldBeansCollected: 0
        };

        // Bean Collection Index System
        this.beanCollection = new Set(); // Track unlocked beans
        this.beanCollectionUnlocked = false; // Bean collection unlocked at level 3
        this.allBeanTypes = [
            { name: 'Beanstalk', image: 'Assets/BasicBeans/beanstalkbean.png' },
            { name: 'Snap Pea', image: 'Assets/BasicBeans/Snappeabean.png' },
            { name: 'Jellybean Vine', image: 'Assets/BasicBeans/Jellybean.png' },
            { name: 'Bamboo-Bean', image: 'Assets/BasicBeans/Bamboobean.png' },
            { name: 'Coffee Beanstalk', image: 'Assets/BasicBeans/Coffebean.png' },
            { name: 'Corn Bean', image: 'Assets/BasicBeans/Cornbean.png' },
            { name: 'Cloud Bean', image: 'Assets/BasicBeans/Cloudbean.png' },
            { name: 'Crystal Bean', image: 'Assets/BasicBeans/Crystalbean.png' },
            { name: 'Fire Pod', image: 'Assets/BasicBeans/Firebean.png' },
            { name: 'Frost Pea', image: 'Assets/BasicBeans/Frostbean.png' },
            { name: 'Choco Vine', image: 'Assets/BasicBeans/Chocobean.png' },
            { name: 'Ironvine', image: 'Assets/BasicBeans/Ironbean.png' },
            { name: 'Honeyvine', image: 'Assets/BasicBeans/Honeybean.png' },
            { name: 'Sunbean', image: 'Assets/BasicBeans/Sunbean.png' },
            { name: 'Moonbean', image: 'Assets/BasicBeans/Moombean.png' },
            { name: 'Neon Soy', image: 'Assets/BasicBeans/Neonbean.png' },
            { name: 'Prism Stalk', image: 'Assets/BasicBeans/Prysmbean.png' },
            { name: 'Royal Stalk', image: 'Assets/BasicBeans/Royalbean.png' },
            { name: 'Shadow Bean', image: 'Assets/BasicBeans/Shadowbean.png' },
            { name: 'Thunder Pod', image: 'Assets/BasicBeans/Thunderboltpeabean.png' }
        ];
        
        // Audio system - always enabled
        this.volume = 0.7;
        this.sounds = {};
        this.backgroundMusic = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createPots();
        // Old cloud system disabled - using day/night cycle clouds
        // this.startCloudAnimation();
        this.initializeGameState();
        
        // Initialize level system early
        setTimeout(() => {
            this.initializeLevelBar();
        }, 500); // Give DOM time to load
    }

    // Initialize game state from API
    async initializeGameState() {
        try {
            const response = await fetch('/api/game-state');
            if (response.ok) {
                const gameState = await response.json();
                this.currentMoney = gameState.coins;
                this.updateMoneyDisplay();
                
                // Load pots data and initialize level bars
                this.pots = gameState.pots || [];
                setTimeout(() => {
                    console.log('🌱 DEBUG: Initializing level bars for all plants');
                    this.updateAllPlantLevelBars();
                }, 2000); // Give DOM time to load
                
                // Periodically refresh level bars to ensure they're visible AND restart bean spawning if stopped
                setInterval(() => {
                    console.log('⏰ Periodic level bar and bean spawning check...');
                    this.updateAllPlantLevelBars();
                    
                    // Check for missing clippers on plants with clippers unlocked
                    this.pots.forEach((potData, potIndex) => {
                        if (potData && potData.clipper_unlocked && potData.instance_id) {
                            const pot = document.getElementById(`pot-${potIndex}`);
                            if (pot && !pot.querySelector('.plant-clipper')) {
                                console.log(`✂️ Missing clipper for plant in pot ${potIndex} (level ${potData.level}, clipper level ${potData.clipper_level}), creating it now!`);
                                this.createOrUpdateClipper(potIndex, potData.clipper_level || 1);
                            }
                        }
                    });
                    
                    // Also check all ready plants explicitly and restart spawning if needed
                    this.growingPlants.forEach((plantData, potIndex) => {
                        if (plantData.ready && this.pots[potIndex]) {
                            const levelBar = document.getElementById(`level-bar-${potIndex}`);
                            if (!levelBar) {
                                console.log(`🚨 Missing level bar for ready plant in pot ${potIndex}, creating it now!`);
                                const potData = this.pots[potIndex];
                                this.createPlantLevelBar(
                                    potIndex, 
                                    potData.level || 1, 
                                    potData.experience || 0, 
                                    potData.required_xp || 100
                                );
                            }
                            
                            // Check if spawning has stopped unexpectedly and restart it
                            const potState = this.pots[potIndex]?.state;
                            if ((potState === 'ready' || potState === 'growing') && 
                                plantData.vineElement && plantData.vineElement.parentNode &&
                                (!plantData.continuousSpawning || !plantData.continuousSpawning.intervalId)) {
                                
                                console.log(`🔄 DEBUG: Restarting bean spawning for pot ${potIndex} (was stopped unexpectedly)`);
                                const rect = plantData.vineElement.getBoundingClientRect();
                                this.startContinuousSpawning(
                                    potIndex, 
                                    plantData.beanImage, 
                                    rect.left + rect.width / 2, 
                                    rect.top + rect.height / 2, 
                                    plantData.seedName
                                );
                            }
                        }
                    });
                }, 5000); // Every 5 seconds
                
                console.log('Game state initialized from API');
            }
        } catch (error) {
            console.log('Could not load game state from API, using defaults:', error);
        }
        
        // Start background shop refresh checking
        this.startBackgroundShopRefresh();
        
        // Initialize audio system
        this.initializeAudioSystem();
    }

    // Background shop refresh checking
    startBackgroundShopRefresh() {
        // Check for shop refreshes every 30 seconds
        setInterval(async () => {
            try {
                const response = await fetch('/api/shop');
                if (response.ok) {
                    const newShopData = await response.json();
                    // If shop has refreshed and shop is currently open, update display
                    if (this.isShopOpen && this.shopData && 
                        newShopData.refresh_at !== this.shopData.refresh_at) {
                        this.shopData = newShopData;
                        this.populateShop();
                        this.showShopNotification('✨ Shop refreshed! Check out the new items!', 'refresh');
                        console.log('Shop refreshed automatically');
                    } else if (!this.shopData) {
                        this.shopData = newShopData;
                    }
                }
            } catch (error) {
                console.log('Background shop refresh check failed:', error);
            }
        }, 30000);
    }

    setupEventListeners() {
        const startButton = document.getElementById('startButton');
        startButton.addEventListener('click', () => {
            // Start background music on user interaction (bypasses autoplay restrictions)
            this.startBackgroundMusic();
            this.startGame();
        });
        
        const shopButton = document.getElementById('shopButton');
        shopButton.addEventListener('click', () => {
            this.playSound('swoosh');
            this.onShopClick();
        });
        
        const inventoryButton = document.getElementById('inventoryButton');
        inventoryButton.addEventListener('click', () => {
            this.playSound('swoosh');
            this.onInventoryClick();
        });
        
        const inventoryClose = document.getElementById('inventoryClose');
        inventoryClose.addEventListener('click', () => {
            this.playSound('swoosh');
            this.closeInventory();
        });
        
        const inventoryOverlay = document.getElementById('inventoryOverlay');
        inventoryOverlay.addEventListener('click', () => {
            this.playSound('swoosh');
            this.closeInventory();
        });
        
        const shopClose = document.getElementById('shopClose');
        shopClose.addEventListener('click', () => {
            this.playSound('swoosh');
            this.closeShop();
        });
        
        const shopOverlay = document.getElementById('shopOverlay');
        shopOverlay.addEventListener('click', () => {
            this.playSound('swoosh');
            this.closeShop();
        });
        
        // Add global drag event listeners
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));

        // Purchase modal event listeners
        const purchaseConfirm = document.getElementById('purchaseConfirm');
        purchaseConfirm.addEventListener('click', () => {
            this.playSound('swoosh');
            this.confirmPurchase();
        });
        
        const purchaseCancel = document.getElementById('purchaseCancel');
        purchaseCancel.addEventListener('click', () => {
            this.playSound('swoosh');
            this.cancelPurchase();
        });
        
        const purchaseModalOverlay = document.getElementById('purchaseModalOverlay');
        purchaseModalOverlay.addEventListener('click', () => {
            this.playSound('swoosh');
            this.cancelPurchase();
        });
        
        // Burn modal event listeners
        const burnConfirm = document.getElementById('burnConfirm');
        burnConfirm.addEventListener('click', () => {
            this.playSound('swoosh');
            this.confirmBurn();
        });
        
        const burnCancel = document.getElementById('burnCancel');
        burnCancel.addEventListener('click', () => {
            this.playSound('swoosh');
            this.cancelBurn();
        });
        
        const burnModalOverlay = document.getElementById('burnModalOverlay');
        burnModalOverlay.addEventListener('click', () => {
            this.playSound('swoosh');
            this.cancelBurn();
        });

    }

    async startGame() {
        // Stop floating beans animation
        floatingBeansManager.stop();
        
        try {
            // Request fullscreen
            await this.enterFullscreen();
            
            // Hide start screen and show game
            document.getElementById('startScreen').classList.add('hidden');
            document.getElementById('gameContainer').style.display = 'block';
            
            // Load initial game state
            await this.loadGameState();
            
            // Start background music immediately after game starts
            this.startBackgroundMusic();
            
            // Start tutorial for new players when they enter the game
            this.startTutorial();
            
            // Initialize level bar
            this.initializeLevelBar();
            
            // Initialize bean collection index
            this.initializeBeanIndex();
            
        } catch (error) {
            console.warn('Fullscreen not supported or denied, continuing anyway');
            // Still start the game even if fullscreen fails
            document.getElementById('startScreen').classList.add('hidden');
            document.getElementById('gameContainer').style.display = 'block';
            
            // Load initial game state
            await this.loadGameState();
            
            // Start background music immediately after game starts
            this.startBackgroundMusic();
            
            // Start tutorial for new players when they enter the game
            this.startTutorial();
            
            // Initialize level bar
            this.initializeLevelBar();
            
            // Initialize bean collection index
            this.initializeBeanIndex();
        }
    }

    async enterFullscreen() {
        const element = document.documentElement;
        
        if (element.requestFullscreen) {
            await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            await element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
            await element.msRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
            await element.mozRequestFullScreen();
        }
        
        this.isFullscreen = true;
    }

    async loadGameState() {
        try {
            const response = await fetch('/api/game-state');
            this.gameState = await response.json();
            
            // Only sync money from server if our local money hasn't increased from bean collection
            console.log('💰 DEBUG: Loading game state. Current money:', this.currentMoney, 'Server money:', this.gameState.coins);
            if (this.currentMoney <= 100) { // Only sync if we're at starting amount or below
                console.log('💰 DEBUG: Syncing money from server (no local earnings detected)');
                this.currentMoney = this.gameState.coins;
                this.updateMoneyDisplay();
            } else {
                console.log('💰 DEBUG: Keeping local money (bean earnings detected):', this.currentMoney);
                // Send our earned money to the server
                this.syncMoneyToServer();
            }
            
            this.updatePotVisuals();
            console.log('✅ Game state loaded:', this.gameState);
        } catch (error) {
            console.error('❌ Failed to load game state:', error);
        }
    }

    createPots() {
        const potsContainer = document.getElementById('potsContainer');
        
        for (let i = 0; i < 12; i++) {
            const pot = document.createElement('div');
            pot.className = 'pot';
            pot.id = `pot-${i}`;  // ADD ID FOR CLIPPER ATTACHMENT
            pot.dataset.potIndex = i;
            // Pot clicking disabled - only hover for growth info
            // pot.addEventListener('click', () => this.onPotClick(i));
            
            // Add hover listeners for growth progress display
            pot.addEventListener('mouseenter', () => this.onPotHover(i));
            pot.addEventListener('mouseleave', () => this.onPotHoverEnd(i));
            
            potsContainer.appendChild(pot);
            this.pots.push({
                element: pot,
                index: i,
                state: 'empty'
            });
        }
    }

    updatePotVisuals() {
        if (!this.gameState || !this.gameState.pots) return;
        
        this.gameState.pots.forEach((potData, index) => {
            const potElement = this.pots[index].element;
            potElement.className = `pot ${potData.state}`;
            
            // Update pot data
            this.pots[index].state = potData.state;
            this.pots[index].data = potData;
        });
    }

    // Pot hover to show growth progress
    onPotHover(index) {
        const potData = this.pots[index];
        
        if (potData && potData.state === 'growing') {
            // Show growth progress tooltip with leveling info
            const speciesName = potData.species_name || 'Plant';
            const level = potData.level || 1;
            const experience = potData.experience || 0;
            const requiredXP = potData.required_xp || 100;
            
            // Calculate growth progress if available
            let progress = 0;
            if (potData.planted_at && potData.grow_time) {
                const elapsed = (Date.now() / 1000) - potData.planted_at;
                progress = Math.min((elapsed / potData.grow_time) * 100, 100);
            }
            
            this.showGrowthTooltip(index, speciesName, progress, level, experience, requiredXP);
        }
    }

    onPotHoverEnd(index) {
        // Hide any tooltips
        this.hideGrowthTooltip();
    }

    showGrowthTooltip(potIndex, seedName, progress) {
        // Remove any existing tooltip
        this.hideGrowthTooltip();
        
        const potElement = document.getElementById(`pot-${potIndex}`);
        if (!potElement) return;
        
        const potRect = potElement.getBoundingClientRect();
        
        const tooltip = document.createElement('div');
        tooltip.id = 'growth-tooltip';
        tooltip.className = 'growth-tooltip';
        
        const level = arguments[3] || 1;
        const experience = arguments[4] || 0;
        const requiredXP = arguments[5] || 100;
        const xpProgress = requiredXP > 0 ? (experience / requiredXP) * 100 : 0;
        
        tooltip.innerHTML = `
            <div class="tooltip-header">${seedName} - Level ${level}</div>
            <div class="tooltip-progress">Growth: ${progress.toFixed(1)}%</div>
            <div class="tooltip-bar">
                <div class="tooltip-fill" style="width: ${progress}%"></div>
            </div>
            <div class="tooltip-xp">XP: ${experience}/${requiredXP}</div>
            <div class="tooltip-bar">
                <div class="tooltip-fill xp-fill" style="width: ${xpProgress}%"></div>
            </div>
        `;
        
        // Position tooltip above the pot
        tooltip.style.position = 'fixed';
        tooltip.style.left = (potRect.left + potRect.width / 2) + 'px';
        tooltip.style.bottom = (window.innerHeight - potRect.top + 10) + 'px';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.zIndex = '1000';
        tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
        tooltip.style.color = 'white';
        tooltip.style.padding = '8px 12px';
        tooltip.style.borderRadius = '8px';
        tooltip.style.fontSize = '12px';
        tooltip.style.minWidth = '120px';
        
        document.body.appendChild(tooltip);
    }

    hideGrowthTooltip() {
        const existing = document.getElementById('growth-tooltip');
        if (existing) {
            existing.remove();
        }
    }

    // Legacy pot click function (disabled but kept for reference)
    async onPotClick(index) {
        // Pot clicking disabled - functionality moved to other interactions
        console.log(`Pot clicking disabled for pot ${index}`);
    }

    startCloudAnimation() {
        // Create initial clouds
        for (let i = 0; i < 3; i++) {
            setTimeout(() => this.createCloud(), i * 2000);
        }
        
        // Create new clouds more frequently
        setInterval(() => {
            if (Math.random() > 0.4) { // 60% chance every interval
                this.createCloud();
            }
        }, 2000); // Check every 2 seconds
        
        // Additional cloud bursts occasionally
        setInterval(() => {
            if (Math.random() > 0.8) { // 20% chance for burst
                for (let i = 0; i < 2; i++) {
                    setTimeout(() => this.createCloud(), i * 1000);
                }
            }
        }, 8000); // Check every 8 seconds
    }

    createCloud() {
        const cloudsContainer = document.getElementById('cloudsContainer');
        const cloud = document.createElement('div');
        
        // Randomly choose between cloud.png and cloud2.png
        const cloudAsset = Math.random() > 0.5 ? 'cloud.png' : 'cloud2.png';
        cloud.style.backgroundImage = `url('Assets/${cloudAsset}')`;
        cloud.style.backgroundSize = 'contain';
        cloud.style.backgroundRepeat = 'no-repeat';
        cloud.style.position = 'absolute';
        cloud.style.width = '200px';
        cloud.style.height = '100px';
        
        // Random direction (left to right or right to left)
        const direction = Math.random() > 0.5 ? 'right' : 'left';
        cloud.className = `cloud moving-${direction}`;
        
        // Random vertical position (anywhere on screen, avoiding bottom 250px for grass/pots)
        const topPosition = Math.random() * (window.innerHeight - 250);
        cloud.style.top = `${topPosition}px`;
        
        // Set up dynamic scaling variables
        const startScale = 0.5 + Math.random() * 0.8; // 0.5 to 1.3
        const midScale = startScale + (Math.random() * 0.6 - 0.3); // ±0.3 variation
        const endScale = startScale + (Math.random() * 0.4 - 0.2); // ±0.2 variation
        
        // Set up drift variables for vertical movement
        const drift1 = (Math.random() * 40 - 20) + 'px'; // ±20px
        const drift2 = (Math.random() * 60 - 30) + 'px'; // ±30px
        
        // Apply CSS variables
        cloud.style.setProperty('--start-scale', startScale);
        cloud.style.setProperty('--mid-scale', Math.max(0.3, midScale));
        cloud.style.setProperty('--end-scale', Math.max(0.3, endScale));
        cloud.style.setProperty('--drift-1', drift1);
        cloud.style.setProperty('--drift-2', drift2);
        
        // Random opacity variation
        const opacity = 0.3 + Math.random() * 0.5; // 0.3 to 0.8
        cloud.style.opacity = opacity;
        
        // Random animation duration (20-45 seconds)
        const duration = 20 + Math.random() * 25;
        cloud.style.animationDuration = `${duration}s`;
        
        cloudsContainer.appendChild(cloud);
        this.clouds.push(cloud);
        
        // Remove cloud after animation completes
        setTimeout(() => {
            if (cloud.parentNode) {
                cloud.parentNode.removeChild(cloud);
                const index = this.clouds.indexOf(cloud);
                if (index > -1) {
                    this.clouds.splice(index, 1);
                }
            }
        }, duration * 1000);
    }

    // Money Management Methods
    updateMoneyDisplay() {
        const moneyElement = document.getElementById('moneyAmount');
        if (moneyElement) {
            // Add changing animation
            moneyElement.classList.add('changing');
            
            // Format money with commas
            const formattedMoney = '$' + this.currentMoney.toLocaleString();
            moneyElement.textContent = formattedMoney;
            
            // Remove animation class after animation completes
            setTimeout(() => {
                moneyElement.classList.remove('changing');
            }, 500);
        }
    }



    // Update money from game state (for later use)
    updateMoneyFromGameState() {
        if (this.gameState && this.gameState.coins !== undefined) {
            this.currentMoney = this.gameState.coins;
            this.updateMoneyDisplay();
        }
    }

    // Shop functionality
    onShopClick() {
        console.log('Shop button clicked!');
        this.toggleShop();
    }

    toggleShop() {
        if (this.isShopOpen) {
            this.closeShop();
        } else {
            this.openShop();
        }
    }

    async openShop() {
        this.isShopOpen = true;
        document.getElementById('shopPanel').classList.add('active');
        document.getElementById('shopOverlay').classList.add('active');
        await this.loadShopData();
        this.populateShop();
        this.startShopNotifications();
        
        // Hide tutorial objective when shop is open
        if (this.tutorialActive) {
            document.getElementById('tutorialObjective').classList.remove('active');
        }
        
        console.log('Shop opened');
    }

    // API Functions
    async loadShopData() {
        try {
            const response = await fetch('/api/shop');
            if (response.ok) {
                this.shopData = await response.json();
                console.log('Shop data loaded:', this.shopData);
            } else {
                console.error('Failed to load shop data');
                // Fallback to create local shop inventory if API fails
                this.createShopInventory();
            }
        } catch (error) {
            console.error('Error loading shop data:', error);
            this.createShopInventory();
        }
    }

    startShopNotifications() {
        if (this.shopTimer) {
            clearInterval(this.shopTimer);
        }
        
        // Reset notification tracking
        this.notificationShown = {
            twoMinute: false,
            oneMinute: false
        };
        
        this.shopTimer = setInterval(() => {
            this.checkShopNotifications();
        }, 1000);
        
        this.checkShopNotifications(); // Check immediately
    }

    checkShopNotifications() {
        if (!this.shopData || !this.shopData.refresh_at) {
            return;
        }
        
        const now = Date.now() / 1000; // Current time in seconds
        const timeUntilRefresh = Math.max(0, this.shopData.refresh_at - now);
        
        if (timeUntilRefresh <= 0) {
            // Shop has refreshed!
            this.hideShopNotification();
            this.showShopNotification('✨ Shop has been refreshed! New items available!', 'refresh');
            this.loadShopData().then(() => {
                if (this.isShopOpen) {
                    this.populateShop();
                }
            });
            return;
        }
        
        // Show 2-minute warning
        if (timeUntilRefresh <= 120 && timeUntilRefresh > 60 && !this.notificationShown.twoMinute) {
            this.showShopNotification('🏪 Shop refreshing in 2 minutes!', 'warning-2min');
            this.notificationShown.twoMinute = true;
            console.log('🔔 2-minute shop notification shown');
        }
        
        // Show 1-minute warning
        if (timeUntilRefresh <= 60 && !this.notificationShown.oneMinute) {
            this.showShopNotification('⚠️ Shop refreshing in 1 minute!', 'warning-1min');
            this.notificationShown.oneMinute = true;
            console.log('🔔 1-minute shop notification shown');
        }
    }
    
    showShopNotification(message, cssClass = '') {
        const notification = document.getElementById('shopNotification');
        if (notification) {
            notification.textContent = message;
            notification.className = 'shop-notification show ' + cssClass;
            
            // Play notification sound
            this.playSound('notification');
            
            // Auto-hide after 6 seconds (slightly longer for better visibility)
            setTimeout(() => {
                this.hideShopNotification();
            }, 6000);
        }
    }
    
    hideShopNotification() {
        const notification = document.getElementById('shopNotification');
        if (notification) {
            notification.classList.remove('show');
        }
    }

    closeShop() {
        this.isShopOpen = false;
        document.getElementById('shopPanel').classList.remove('active');
        document.getElementById('shopOverlay').classList.remove('active');
        this.hideSeedTooltip(); // Hide tooltip when closing shop
        
        // Show tutorial objective when shop is closed (if tutorial is active)
        if (this.tutorialActive) {
            document.getElementById('tutorialObjective').classList.add('active');
        }
        
        // Clear the shop timer when closing
        if (this.shopTimer) {
            clearInterval(this.shopTimer);
            this.shopTimer = null;
        }
        
        console.log('Shop closed');
    }

    populateShop() {
        const shopGrid = document.getElementById('shopGrid');
        shopGrid.innerHTML = '';

        console.log('Populating shop with shopData:', this.shopData);

        if (this.shopData && this.shopData.slots) {
            // Use API data to populate shop
            console.log('Using API data, slots:', this.shopData.slots);
            this.shopData.slots.forEach((slot, index) => {
                console.log(`Creating shop item for slot ${index}:`, slot);
                const itemElement = this.createShopItemElement(slot, index);
                shopGrid.appendChild(itemElement);
            });
        } else {
            console.log('Using fallback shop inventory');
            // Fallback to hardcoded inventory if no API data
            if (this.shopInventory.length === 0) {
                this.createShopInventory();
            }
            this.shopInventory.forEach(item => {
                const itemElement = this.createShopItemElement(item);
                shopGrid.appendChild(itemElement);
            });
        }
    }

    createShopInventory() {
        // Create one of each seed type for the shop
        this.shopInventory = [
            { id: 1, name: 'Beanstalk', type: 'seed', rarity: 'common', price: 50, image: 'Assets/PlantSeeds/Beanstalkseeds.png', available: true },
            { id: 2, name: 'Snap Pea', type: 'seed', rarity: 'common', price: 90, image: 'Assets/PlantSeeds/SnappeaSeeds.png', available: true },
            { id: 3, name: 'Bamboo Bean', type: 'seed', rarity: 'common', price: 300, image: 'Assets/PlantSeeds/Bamboobeanseeds.png', available: true },
            { id: 4, name: 'Jellybean Vine', type: 'seed', rarity: 'common', price: 170, image: 'Assets/PlantSeeds/jellybeanvineseeds.png', available: true },
            { id: 5, name: 'Coffee Creeper', type: 'seed', rarity: 'common', price: 540, image: 'Assets/PlantSeeds/coffeebeanstalkseeds.png', available: true },
            { id: 6, name: 'Frost Pea', type: 'seed', rarity: 'common', price: 1700, image: 'Assets/PlantSeeds/frostpeaseeds.png', available: true },
            { id: 7, name: 'Thunder Pod', type: 'seed', rarity: 'uncommon', price: 970, image: 'Assets/PlantSeeds/thunderpodseeds.png', available: true },
            { id: 8, name: 'Choco Vine', type: 'seed', rarity: 'uncommon', price: 3000, image: 'Assets/PlantSeeds/Chocovineseeds.png', available: true },
            { id: 9, name: 'Ironvine', type: 'seed', rarity: 'uncommon', price: 5300, image: 'Assets/PlantSeeds/Ironvineseeds.png', available: true },
            { id: 10, name: 'Honeyvine', type: 'seed', rarity: 'uncommon', price: 9300, image: 'Assets/PlantSeeds/Honeyvineseeds.png', available: true },
            { id: 11, name: 'Sunbean', type: 'seed', rarity: 'uncommon', price: 16000, image: 'Assets/PlantSeeds/Sunbeanseeds.png', available: true },
            { id: 12, name: 'Moonbean', type: 'seed', rarity: 'uncommon', price: 28000, image: 'Assets/PlantSeeds/Moonbeanseeds.png', available: true },
            { id: 13, name: 'Cloud Creeper', type: 'seed', rarity: 'uncommon', price: 49000, image: 'Assets/PlantSeeds/Cloudcreeperseeds.png', available: true },
            { id: 14, name: 'Royal Stalk', type: 'seed', rarity: 'uncommon', price: 86000, image: 'Assets/PlantSeeds/Royalstalkseeds.png', available: true },
            { id: 15, name: 'Crystal Bean', type: 'seed', rarity: 'rare', price: 150000, image: 'Assets/PlantSeeds/CrystalBeanseeds.png', available: true },
            { id: 16, name: 'Neon Soy', type: 'seed', rarity: 'rare', price: 260000, image: 'Assets/PlantSeeds/Neonsoyseeds.png', available: true },
            { id: 17, name: 'Vinecorn', type: 'seed', rarity: 'rare', price: 450000, image: 'Assets/PlantSeeds/Vinecornseeds.png', available: true },
            { id: 18, name: 'Fire Pod', type: 'seed', rarity: 'rare', price: 780000, image: 'Assets/PlantSeeds/Firepodseeds.png', available: true },
            { id: 19, name: 'Shadow Bean', type: 'seed', rarity: 'rare', price: 1350000, image: 'Assets/PlantSeeds/Shadowbeanseeds.png', available: true },
            { id: 20, name: 'Prism Stalk', type: 'seed', rarity: 'legendary', price: 2340000, image: 'Assets/PlantSeeds/Prismstalkseeds.png', available: true },
        ];
    }

    createShopItemElement(item, slotIndex = null) {
        const itemDiv = document.createElement('div');
        
        console.log('Creating shop item element for:', item, 'slotIndex:', slotIndex);
        
        // Handle both API format (slot) and legacy format (item)
        const isApiFormat = item.species_id !== undefined;
        const name = isApiFormat ? item.species_name : item.name;
        const price = isApiFormat ? item.price : item.price;
        const rarity = isApiFormat ? item.rarity : item.rarity;
        const stock = isApiFormat ? item.stock : null;
        const available = isApiFormat ? (item.stock > 0) : item.available;
        const image = isApiFormat ? this.getSeedImageForSpecies(item.species_id) : item.image;
        
        console.log(`Item details - name: ${name}, price: ${price}, stock: ${stock}, available: ${available}`);
        
        const canAfford = this.currentMoney >= price;
        // Items are "available" if they have stock, regardless of whether player can afford them
        // We'll show price/affordability separately 
        const availabilityClass = available ? 'available' : 'unavailable';
        
        itemDiv.className = `shop-item ${availabilityClass} rarity-${rarity}`;
        itemDiv.onclick = () => this.onShopItemClick(isApiFormat ? { ...item, slotIndex } : item);

        // Always show price
        const priceContent = `<div class="shop-item-price">$${price.toLocaleString()}</div>`;
        
        // Show availability status if there's an issue
        let statusContent = '';
        if (!available) {
            statusContent = `<div class="shop-item-status out-of-stock">OUT OF STOCK!</div>`;
        } else if (!canAfford) {
            statusContent = `<div class="shop-item-status too-expensive">NEED $${(price - this.currentMoney).toLocaleString()} MORE</div>`;
        }

        // Stock display for API format - lowered threshold for low stock warning
        const stockContent = isApiFormat ? 
            `<div class="shop-item-stock ${stock <= 1 ? 'low-stock' : ''}">Stock: ${stock}</div>` : '';

        itemDiv.innerHTML = `
            <div class="shop-item-icon" style="background-image: url('${image}')"></div>
            <h3 style="color: white; font-size: 14px; margin: 5px 0; text-align: center;">${name}</h3>
            ${priceContent}
            ${statusContent}
            ${stockContent}
        `;

        return itemDiv;
    }

    // Map species IDs to seed images
    getSeedImageForSpecies(speciesId) {
        const seedImageMap = {
            'beanstalk': 'Assets/PlantSeeds/Beanstalkseeds.png',
            'snap_pea': 'Assets/PlantSeeds/SnappeaSeeds.png',
            'jellybean_vine': 'Assets/PlantSeeds/jellybeanvineseeds.png',
            'bamboo_bean': 'Assets/PlantSeeds/Bamboobeanseeds.png',
            'coffee_beanstalk': 'Assets/PlantSeeds/coffeebeanstalkseeds.png',
            'thunder_pod': 'Assets/PlantSeeds/thunderpodseeds.png',
            'frost_pea': 'Assets/PlantSeeds/frostpeaseeds.png',
            'choco_vine': 'Assets/PlantSeeds/Chocovineseeds.png',
            'ironvine': 'Assets/PlantSeeds/Ironvineseeds.png',
            'honeyvine': 'Assets/PlantSeeds/Honeyvineseeds.png',
            'sunbean': 'Assets/PlantSeeds/Sunbeanseeds.png',
            'moonbean': 'Assets/PlantSeeds/Moonbeanseeds.png',
            'cloud_creeper': 'Assets/PlantSeeds/Cloudcreeperseeds.png',
            'royal_stalk': 'Assets/PlantSeeds/Royalstalkseeds.png',
            'crystal_bean': 'Assets/PlantSeeds/CrystalBeanseeds.png',
            'neon_soy': 'Assets/PlantSeeds/Neonsoyseeds.png',
            'vinecorn': 'Assets/PlantSeeds/Vinecornseeds.png',
            'fire_pod': 'Assets/PlantSeeds/Firepodseeds.png',
            'shadow_bean': 'Assets/PlantSeeds/Shadowbeanseeds.png',
            'prism_stalk': 'Assets/PlantSeeds/Prismstalkseeds.png'
        };
        return seedImageMap[speciesId] || 'Assets/PlantSeeds/Beanstalkseeds.png'; // Fallback
    }

    onShopItemClick(item) {
        console.log('🛒 DEBUG: Shop item clicked:', item);
        console.log('🛒 DEBUG: Current money:', this.currentMoney);
        console.log('🛒 DEBUG: Item price:', item.price);
        console.log('🛒 DEBUG: Can afford?', this.currentMoney >= item.price);
        
        // Handle both API format (has slotIndex) and legacy format
        const isApiFormat = item.slotIndex !== undefined;
        const name = isApiFormat ? item.species_name : item.name;
        const price = item.price;
        const available = isApiFormat ? (item.stock > 0) : item.available;
        
        // Always show purchase modal - players can attempt to buy anything with stock
        // Backend will handle validation (coins, etc.)
        this.showPurchaseModal(item);
    }

    showPurchaseModal(item) {
        // Handle both API format and legacy format
        const isApiFormat = item.slotIndex !== undefined;
        const name = isApiFormat ? item.species_name : item.name;
        const price = item.price;
        const rarity = isApiFormat ? item.rarity : item.rarity;
        const stock = isApiFormat ? item.stock : null;
        const image = isApiFormat ? this.getSeedImageForSpecies(item.species_id) : item.image;
        const available = isApiFormat ? (item.stock > 0) : item.available;
        
        // Store the pending purchase
        this.pendingPurchase = {
            item,
            isApiFormat,
            name,
            price,
            available,
            canAfford: this.currentMoney >= price
        };
        
        // Populate modal content
        document.getElementById('purchaseItemIcon').style.backgroundImage = `url('${image}')`;
        document.getElementById('purchaseItemName').textContent = name;
        
        const rarityElement = document.getElementById('purchaseItemRarity');
        rarityElement.textContent = rarity.charAt(0).toUpperCase() + rarity.slice(1).replace('_', '-');
        rarityElement.className = `purchase-item-rarity ${rarity}`;
        
        document.getElementById('purchaseItemStock').textContent = stock ? `Stock: ${stock}` : '';
        document.getElementById('purchasePrice').textContent = `$${price.toLocaleString()}`;
        document.getElementById('purchaseBalance').textContent = `$${this.currentMoney.toLocaleString()}`;
        
        const remainingAmount = this.currentMoney - price;
        const remainingElement = document.getElementById('purchaseRemainingAmount');
        remainingElement.textContent = `$${remainingAmount.toLocaleString()}`;
        remainingElement.className = remainingAmount < 0 ? 'negative' : '';
        
        // Update confirm button based on affordability and availability
        const confirmButton = document.getElementById('purchaseConfirm');
        if (!available) {
            confirmButton.innerHTML = '<span class="purchase-btn-icon">📦</span><span>Out of Stock</span>';
            confirmButton.disabled = true;
            confirmButton.style.opacity = '0.5';
        } else {
            // Always allow clicking the button - we'll check affordability at confirmation time
            confirmButton.innerHTML = '<span class="purchase-btn-icon">💰</span><span>Purchase</span>';
            confirmButton.disabled = false;
            confirmButton.style.opacity = '1';
        }
        
        // Show modal
        document.getElementById('purchaseModal').classList.add('active');
        document.getElementById('purchaseModalOverlay').classList.add('active');
    }

    cancelPurchase() {
        // Hide modal
        document.getElementById('purchaseModal').classList.remove('active');
        document.getElementById('purchaseModalOverlay').classList.remove('active');
        
        // Clear pending purchase
        this.pendingPurchase = null;
    }

    async confirmPurchase() {
        if (!this.pendingPurchase) {
            console.log('❌ DEBUG: No pending purchase');
            return;
        }
        
        // Re-check affordability and availability at purchase time (not modal open time)
        const canAffordNow = this.currentMoney >= this.pendingPurchase.price;
        const isAvailable = this.pendingPurchase.available;
        
        console.log('🛒 DEBUG: Confirming purchase:');
        console.log('   - Item:', this.pendingPurchase.name);
        console.log('   - Price:', this.pendingPurchase.price);
        console.log('   - Current Money:', this.currentMoney);
        console.log('   - Can Afford Now:', canAffordNow);
        console.log('   - Is Available:', isAvailable);
        
        if (!isAvailable) {
            this.showErrorMessage('📦 This item is out of stock!');
            return;
        }
        
        if (!canAffordNow) {
            this.showErrorMessage(`💰 Not enough coins! You need ${this.pendingPurchase.price} but only have ${this.currentMoney}.`);
            return;
        }
        
        // Play purchase sound effect
        this.playSound('purchase');
        
        // Process the purchase
        if (this.pendingPurchase.isApiFormat) {
            await this.purchaseItemFromAPI(this.pendingPurchase.item);
        } else {
            this.purchaseItem(this.pendingPurchase.item);
        }
        
        // Hide modal after purchase
        this.cancelPurchase();
    }

    purchaseItem(item) {
        // Deduct money
        this.currentMoney -= item.price;
        this.updateMoneyDisplay();
        
        // Add to player inventory
        const existingItem = this.playerInventory.find(invItem => invItem.name === item.name);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            this.playerInventory.push({
                id: Date.now(), // Simple ID generation
                name: item.name,
                type: item.type,
                rarity: item.rarity,
                quantity: 1,
                image: item.image
            });
        }
        
        // Update shop display to reflect affordability changes
        this.populateShop();
        
        // Update inventory display if it's open
        if (this.isInventoryOpen) {
            this.populateInventory();
        }
        
        console.log(`Purchased ${item.name} for $${item.price}`);
        
        // Tutorial tracking
        this.onTutorialSeedPurchased();
        
        this.showSuccessMessage(`Successfully purchased ${item.name}! Check your inventory.`);
    }

    async purchaseItemFromAPI(item) {
        console.log('🛒 DEBUG: Starting API purchase for:', item);
        console.log('🛒 DEBUG: Sending request with slot_index:', item.slotIndex);
        
        try {
            const response = await fetch('/api/buy-seed', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    slot_index: item.slotIndex,
                    pot_index: -1 // -1 means add to inventory instead of planting directly
                })
            });

            console.log('🌐 DEBUG: HTTP Response status:', response.status);
            console.log('🌐 DEBUG: HTTP Response ok:', response.ok);
            
            const result = await response.json();
            
            console.log('🔍 DEBUG: API Response:', result);
            console.log('🔍 DEBUG: Response success:', result.success);
            console.log('🔍 DEBUG: Response success type:', typeof result.success);
            console.log('🔍 DEBUG: Response coins:', result.coins);
            console.log('🔍 DEBUG: Full response keys:', Object.keys(result));
            
            if (result.success) {
                console.log(`Successfully purchased ${item.species_name}!`);
                console.log('Purchase result:', result);
                
                // Update local money from server response
                this.currentMoney = result.coins;
                this.updateMoneyDisplay();
                
                // Add to inventory
                const existingItem = this.playerInventory.find(invItem => invItem.name === item.species_name);
                if (existingItem) {
                    existingItem.quantity += 1;
                    console.log(`Updated existing item: ${item.species_name}, new quantity: ${existingItem.quantity}`);
                } else {
                    const newItem = {
                        id: Date.now(),
                        name: item.species_name,
                        type: 'seed',
                        rarity: item.rarity,
                        quantity: 1,
                        image: this.getSeedImageForSpecies(item.species_id)
                    };
                    this.playerInventory.push(newItem);
                    console.log(`Added new item to inventory:`, newItem);
                }
                
                // Use the shop data returned from the purchase instead of making another API call
                if (result.shop) {
                    this.shopData = result.shop;
                    console.log('Updated shop data from purchase response:', this.shopData);
                }
                this.populateShop();
                
                // Update inventory display if it's open
                if (this.isInventoryOpen) {
                    this.populateInventory();
                }
                
                console.log('Current inventory after purchase:', this.playerInventory);
                
                // Tutorial tracking
                this.onTutorialSeedPurchased();
                
                this.showSuccessMessage(`Successfully purchased ${item.species_name}! Check your inventory.`);
            } else {
                console.log('❌ DEBUG: Purchase failed - result.success is:', result.success);
                console.log('❌ DEBUG: Full failed response:', result);
                
                // Update money display with server response
                if (result.coins !== undefined) {
                    this.currentMoney = result.coins;
                    this.updateMoneyDisplay();
                }
                
                // Check if it's an insufficient funds error
                const currentCoins = result.coins || this.currentMoney;
                if (currentCoins < item.price) {
                    this.showErrorMessage(`💰 Not enough coins! You need ${item.price} but only have ${currentCoins}.`);
                } else if (item.stock <= 0) {
                    this.showErrorMessage('📦 This item is out of stock!');
                } else {
                    this.showErrorMessage('❌ Purchase failed. Please try again.');
                }
            }
        } catch (error) {
            console.error('Error purchasing item:', error);
            this.showErrorMessage('🌐 Network error. Please check your connection and try again.');
        }
    }

    // Notification system
    showSuccessMessage(message) {
        console.log('SUCCESS:', message);
        this.showToast(message, 'success');
    }

    showErrorMessage(message) {
        console.error('ERROR:', message);
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</div>
            <div class="toast-message">${message}</div>
        `;

        // Add to page
        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('show'), 100);

        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Inventory functionality
    onInventoryClick() {
        console.log('Inventory button clicked!');
        this.toggleInventory();
    }

    toggleInventory() {
        if (this.isInventoryOpen) {
            this.closeInventory();
        } else {
            this.openInventory();
        }
    }

    openInventory() {
        this.isInventoryOpen = true;
        document.getElementById('inventoryPanel').classList.add('active');
        document.getElementById('inventoryOverlay').classList.add('active');
        this.populateInventory();
        
        // Tutorial tracking
        this.onTutorialInventoryOpened();
        
        console.log('Inventory opened');
    }

    closeInventory() {
        this.isInventoryOpen = false;
        document.getElementById('inventoryPanel').classList.remove('active');
        document.getElementById('inventoryOverlay').classList.remove('active');
        this.hideSeedTooltip(); // Hide tooltip when closing inventory
        console.log('Inventory closed');
    }

    populateInventory() {
        const inventoryGrid = document.getElementById('inventoryGrid');
        inventoryGrid.innerHTML = '';

        // No longer using dummy data - player starts with one beanstalk seed

        console.log('Populating inventory with playerInventory:', this.playerInventory);

        // Populate the grid with inventory items
        if (this.playerInventory.length === 0) {
            console.log('Inventory is empty, showing empty message');
            // Show empty inventory message
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'inventory-empty';
            emptyMessage.innerHTML = `
                <div class="inventory-empty-icon">📦</div>
                <p>Your inventory is empty!</p>
                <p>Buy some seeds from the shop to get started.</p>
            `;
            inventoryGrid.appendChild(emptyMessage);
        } else {
            console.log(`Showing ${this.playerInventory.length} inventory items`);
            // Show inventory items
            this.playerInventory.forEach((item, index) => {
                console.log(`Creating inventory item ${index}:`, item);
                const itemElement = this.createInventoryItemElement(item);
                inventoryGrid.appendChild(itemElement);
            });
        }
    }



    createInventoryItemElement(item) {
        const itemDiv = document.createElement('div');
        itemDiv.className = `inventory-item ${item.type} rarity-${item.rarity}`;
        
        // Add drag functionality
        itemDiv.addEventListener('mousedown', (e) => {
            console.log('🖱️ DEBUG: mousedown on inventory item:', item.name);
            this.startDragging(e, item, itemDiv);
        });
        itemDiv.onclick = (e) => {
            // Only trigger click if not dragging
            if (!this.isDragging) {
                this.onInventoryItemClick(item);
            }
        };

        // Add tooltip functionality
        itemDiv.addEventListener('mouseenter', (e) => {
            if (!this.isDragging) {
                const rect = itemDiv.getBoundingClientRect();
                this.showSeedTooltip(item, rect.right + 10, rect.top + rect.height / 2);
            }
        });

        itemDiv.addEventListener('mouseleave', () => {
            this.hideSeedTooltip();
        });

        // Use image if available, fallback to icon
        const iconContent = item.image 
            ? `<div class="inventory-item-icon" style="background-image: url('${item.image}')"></div>`
            : `<div class="inventory-item-icon">${item.icon || '📦'}</div>`;

        itemDiv.innerHTML = `
            ${iconContent}
            <div class="inventory-item-quantity">× ${item.quantity}</div>
        `;

        return itemDiv;
    }

    onInventoryItemClick(item) {
        console.log('Inventory item clicked:', item);
        // TODO: Implement item interaction (planting, selling, etc.)
        // Note: Click handling is primarily for drag-and-drop functionality
        // No alert needed - just log for debugging
    }

    // Drag and Drop Methods
    startDragging(e, item, sourceElement) {
        e.preventDefault();
        
        console.log('🚀 DEBUG: startDragging called');
        console.log('🚀 DEBUG: Item:', item);
        console.log('🚀 DEBUG: Mouse position:', e.clientX, e.clientY);
        
        this.isDragging = true;
        this.draggedItem = { ...item }; // Clone the item
        
        // Hide tooltip immediately when dragging starts
        this.hideSeedTooltip();
        
        // Add dragging class to source element
        sourceElement.classList.add('dragging');
        
        // Create drag visual
        this.createDragElement(item);
        
        // Close inventory
        this.closeInventory();
        
        // Don't update inventory yet - only update on successful drop
        
        console.log(`🚀 DEBUG: Started dragging: ${item.name}, isDragging: ${this.isDragging}`);
    }

    createDragElement(item) {
        console.log('🎨 DEBUG: createDragElement called');
        this.dragElement = document.createElement('div');
        this.dragElement.className = `dragging-seed rarity-${item.rarity}`;
        this.dragElement.style.backgroundImage = `url('${item.image}')`;
        this.dragElement.style.pointerEvents = 'none';
        
        document.body.appendChild(this.dragElement);
        console.log('🎨 DEBUG: Drag element created and added to body');
        console.log('🎨 DEBUG: Element classes:', this.dragElement.className);
    }

    onMouseMove(e) {
        if (!this.isDragging || !this.dragElement) return;
        
        // Update drag element position
        this.dragElement.style.left = e.clientX + 'px';
        this.dragElement.style.top = e.clientY + 'px';
        
        // Check if we're over a pot for visual feedback
        this.checkPotHover(e);
    }

    checkPotHover(e) {
        // Get element under cursor (drag element already has pointer-events: none)
        const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
        
        // Check if we're over a pot
        const potElement = elementBelow?.closest('.pot');
        
        if (potElement) {
            const potIndex = parseInt(potElement.dataset.potIndex);
            const potData = this.pots[potIndex];
            
            // Check if pot is empty or burnt - just highlight, no pouring yet
            if (potData && (potData.state === 'empty' || potData.state === 'burnt')) {
                if (this.hoveredPot !== potIndex) {
                    this.hoveredPot = potIndex;
                    potElement.classList.add('drag-hover');
                }
            } else {
                // Over a non-empty pot - remove effects
                this.clearPotHover();
            }
        } else {
            // Not over any pot - remove effects
            this.clearPotHover();
        }
    }

    clearPotHover() {
        if (this.hoveredPot !== null) {
            // Remove hover effect from pot
            const potElement = document.querySelector(`[data-pot-index="${this.hoveredPot}"]`);
            if (potElement) {
                potElement.classList.remove('drag-hover');
            }
            
            this.hoveredPot = null;
        }
    }

    onMouseUp(e) {
        console.log('🖱️ DEBUG: onMouseUp called');
        console.log('🖱️ DEBUG: isDragging:', this.isDragging);
        console.log('🖱️ DEBUG: draggedItem:', this.draggedItem?.name);
        console.log('🖱️ DEBUG: Mouse position:', e.clientX, e.clientY);
        
        if (!this.isDragging) {
            console.log('❌ DEBUG: Not dragging, returning early');
            return;
        }
        
        console.log(`🖱️ DEBUG: Dropped seed: ${this.draggedItem.name} at position ${e.clientX}, ${e.clientY}`);
        
        // Check if we're dropping over an empty pot
        const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
        console.log('🎯 DEBUG: Element below on drop:', elementBelow?.tagName, elementBelow?.className);
        
        const potElement = elementBelow?.closest('.pot');
        console.log('🎯 DEBUG: Found pot element:', !!potElement, potElement?.dataset?.potIndex);
        
        if (potElement) {
            const potIndex = parseInt(potElement.dataset.potIndex);
            const potData = this.pots[potIndex];
            
            console.log('🎯 DEBUG: Pot index:', potIndex, 'Pot data:', potData);
            
            // Check if pot is empty or burnt
            if (potData && (potData.state === 'empty' || potData.state === 'burnt')) {
                console.log('✅ DEBUG: Valid drop! Planting', this.draggedItem.name, 'in pot', potIndex);
                this.plantSeedInPot(potIndex);
                return; // plantSeedInPot will handle ending the drag
            } else {
                console.log('❌ DEBUG: Pot not empty, state:', potData?.state);
            }
        } else {
            console.log('❌ DEBUG: No pot element found');
        }
        
        // If we get here, it's not a valid drop - just end dragging
        console.log('❌ DEBUG: Invalid drop location, ending drag');
        this.endDragging();
    }

    endDragging() {
        this.isDragging = false;
        
        // Clear pot hover effects
        this.clearPotHover();
        
        // Remove drag element
        if (this.dragElement) {
            // Make sure to remove any pouring class before removing element
            this.dragElement.classList.remove('pouring');
            this.dragElement.remove();
            this.dragElement = null;
        }
        
        // Clear dragging state
        this.draggedItem = null;
        
        // Remove dragging class from any elements
        document.querySelectorAll('.inventory-item.dragging').forEach(el => {
            el.classList.remove('dragging');
        });
        
        // Remove any lingering drag-hover classes from pots
        document.querySelectorAll('.pot.drag-hover').forEach(el => {
            el.classList.remove('drag-hover');
        });
        
        console.log('Drag ended');
    }

    updateInventoryForDrag(item) {
        const inventoryItem = this.playerInventory.find(invItem => invItem.id === item.id);
        
        if (!inventoryItem) return;
        
        if (inventoryItem.quantity > 1) {
            // Decrease quantity by 1
            inventoryItem.quantity -= 1;
        } else {
            // Remove item completely
            const index = this.playerInventory.indexOf(inventoryItem);
            this.playerInventory.splice(index, 1);
        }
        
        console.log(`Updated inventory: ${item.name} - Remaining quantity: ${inventoryItem ? inventoryItem.quantity : 0}`);
    }

    plantSeedInPot(potIndex) {
        console.log('🌱 DEBUG: plantSeedInPot called with potIndex:', potIndex);
        console.log('🌱 DEBUG: dragElement exists:', !!this.dragElement);
        console.log('🌱 DEBUG: draggedItem:', this.draggedItem?.name);
        
        // Clear pot hover effects first
        this.clearPotHover();
        
        // Add pouring animation to the seed
        if (this.dragElement) {
            console.log('🎭 DEBUG: Adding pouring class to dragElement');
            console.log('🎭 DEBUG: dragElement classes before:', this.dragElement.className);
            this.dragElement.classList.add('pouring');
            console.log('🎭 DEBUG: dragElement classes after:', this.dragElement.className);
        } else {
            console.log('❌ DEBUG: No dragElement found!');
        }
        
        // Get the pot element for visual feedback
        const potElement = document.querySelector(`[data-pot-index="${potIndex}"]`);
        console.log('🎯 DEBUG: Found potElement:', !!potElement);
        if (potElement) {
            potElement.classList.add('drag-hover');
        }
        
        console.log('⏱️ DEBUG: Starting 300ms timeout for planting animation');
        
        // Wait for the pouring animation, then plant the seed
        setTimeout(async () => {
            console.log('⏱️ DEBUG: Timeout completed, starting vine growth');
            
            // Play plant sound when seeds are poured into pot
            this.playSound('plant');
            
            try {
                // First, create the plant instance on the backend
                await this.createPlantInstanceOnBackend(potIndex, this.draggedItem.name);
                
                // Then start growing the vine visually
                const success = this.startVineGrowth(potIndex, this.draggedItem.name);
                
                if (success) {
                    console.log(`✅ DEBUG: Successfully planted ${this.draggedItem.name} in pot ${potIndex}`);
                    
                    // Tutorial tracking
                    this.onTutorialPlantPlanted();
                    
                    // Now that the plant is successful, update the inventory to remove the seed
                    this.updateInventoryForDrag(this.draggedItem);
                } else {
                    console.log(`❌ DEBUG: Failed to plant ${this.draggedItem.name} in pot ${potIndex}`);
                    // Don't remove from inventory if planting failed
                }
            } catch (error) {
                console.error('❌ DEBUG: Error during planting:', error);
                // Don't remove from inventory if there was an error
            }
            
            // Always end the dragging operation (cleanup visual state)
            this.endDragging();
            
        }, 300); // Wait 300ms for the pouring animation
    }

    startVineGrowth(potIndex, seedName) {
        console.log('🌱 DEBUG: startVineGrowth called for', seedName, 'in pot', potIndex);
        
        // Validate pot index and state
        if (!this.pots[potIndex]) {
            console.error('❌ DEBUG: Invalid pot index:', potIndex);
            return false;
        }
        
        if (this.pots[potIndex].state !== 'empty' && this.pots[potIndex].state !== 'burnt' && this.pots[potIndex].state !== 'growing') {
            console.error('❌ DEBUG: Pot is not available for planting, state:', this.pots[potIndex].state);
            return false;
        }
        
        // If pot has burnt remnant, clear it before planting new seed
        if (this.pots[potIndex].state === 'burnt') {
            console.log('🔥 Clearing burnt remnant from pot', potIndex);
            
            // Remove burnt vine element if it exists
            const existingPlantData = this.growingPlants.get(potIndex);
            if (existingPlantData && existingPlantData.vineElement) {
                existingPlantData.vineElement.remove();
                console.log('🔥 Removed burnt vine element');
            }
            
            // Clear plant data and pot state
            this.growingPlants.delete(potIndex);
            const pot = document.querySelector(`.pot[data-pot-index="${potIndex}"]`);
            if (pot) {
                pot.classList.remove('burnt');
                pot.classList.add('empty');
            }
            
            // Update pot state
            this.pots[potIndex].state = 'empty';
            
            console.log('✅ Burnt remnant cleared, pot ready for new planting');
        }
        
        const growthData = this.getPlantGrowthData()[seedName];
        if (!growthData) {
            console.error('❌ DEBUG: No growth data found for', seedName);
            return false; // Return false to indicate failure
        }
        
        console.log('🌱 DEBUG: Growth data:', growthData);
        
        // Update pot state (backend might have already set it to growing)
        if (this.pots[potIndex]) {
            this.pots[potIndex].state = 'growing';
            // Keep existing data if it exists (from backend), otherwise create basic data
            if (!this.pots[potIndex].data) {
            this.pots[potIndex].data = {
                state: 'growing',
                seedName: seedName,
                plantedTime: Date.now()
            };
            }
        }
        
        // Create vine element
        const vineElement = document.createElement('div');
        vineElement.className = 'vine growing';
        vineElement.style.backgroundImage = `url('${growthData.vineImage}')`;
        vineElement.style.animationDuration = `${growthData.growthTime}s`;
        
        // Position vine relative to pot
        const potElement = document.querySelector(`[data-pot-index="${potIndex}"]`);
        if (potElement) {
            // Position vine in same container as pots but absolutely positioned over the specific pot
            const potsContainer = document.getElementById('potsContainer');
            if (potsContainer) {
                // Get pot position relative to container
                const potRect = potElement.getBoundingClientRect();
                const containerRect = potsContainer.getBoundingClientRect();
                
                vineElement.style.left = (potRect.left - containerRect.left + potRect.width/2) + 'px';
                vineElement.style.transform = 'translateX(-50%) scale(0.3, 0)';
                
                potsContainer.appendChild(vineElement);
                console.log('🌱 DEBUG: Vine element created and positioned at pot', potIndex);
                
                // Add animation end listener to ensure smooth transition
                vineElement.addEventListener('animationend', () => {
                    console.log('🎬 DEBUG: Growth animation completed for pot', potIndex);
                    // Force the grown state if animation completes
                    if (vineElement.classList.contains('growing')) {
                        vineElement.classList.remove('growing');
                        vineElement.classList.add('grown');
                        vineElement.style.transform = 'translateX(-50%) scale(1, 1)';
                        console.log('🔧 DEBUG: Forced vine to grown state after animation');
                    }
                });
            }
        }
        
        // Track growing plant
        this.growingPlants.set(potIndex, {
            vineElement: vineElement,
            seedName: seedName,
            startTime: Date.now(),
            growthTime: growthData.growthTime * 1000, // Convert to milliseconds
            ready: false
        });
        
        // Set timer for when plant is ready
        setTimeout(() => {
            this.makeVineReady(potIndex);
        }, growthData.growthTime * 1000);
        
        console.log(`🌱 DEBUG: Started growing ${seedName} for ${growthData.growthTime} seconds`);
        return true; // Return true to indicate success
    }

    makeVineReady(potIndex) {
        console.log('🏆 DEBUG: makeVineReady called for pot', potIndex);
        
        const plantData = this.growingPlants.get(potIndex);
        if (!plantData) {
            console.error('❌ DEBUG: No growing plant found for pot', potIndex);
            return;
        }
        
        // Update vine visual state - vine stays fully grown but gets golden glow
        if (plantData.vineElement) {
            plantData.vineElement.classList.remove('growing');
            plantData.vineElement.classList.add('grown', 'ready');
            console.log('🏆 DEBUG: Vine is now fully grown and ready to harvest!');
            console.log('🔍 DEBUG: Vine element classes:', plantData.vineElement.className);
            console.log('🔍 DEBUG: Vine element style:', plantData.vineElement.style.transform);
            
            // 🫘 SPAWN BEANS AROUND THE GROWN VINE!
            this.spawnBeansAroundVine(potIndex, plantData.seedName, plantData.vineElement);
        }
        
        // Update pot state
        if (this.pots[potIndex]) {
            this.pots[potIndex].state = 'ready';
            this.pots[potIndex].data.state = 'ready';
            
            const potElement = document.querySelector(`[data-pot-index="${potIndex}"]`);
            if (potElement) {
                potElement.className = 'pot ready';
            }
            
            // Force create level bar for the ready plant
            const potData = this.pots[potIndex];
            if (potData) {
                const level = potData.level || 1;
                const experience = potData.experience || 0;
                const requiredXP = potData.required_xp || 100;
                
                console.log('🎯🎯🎯 DEBUG: FORCING level bar creation for ready plant');
                console.log('Level:', level, 'XP:', experience, '/', requiredXP);
                
                // Force create the level bar immediately
                setTimeout(() => {
                    this.createPlantLevelBar(potIndex, level, experience, requiredXP);
                }, 100);
                
                // And again after a short delay to be sure
                setTimeout(() => {
                    this.createPlantLevelBar(potIndex, level, experience, requiredXP);
                }, 500);
            }
        }
        
        // Update plant data
        plantData.ready = true;
        this.growingPlants.set(potIndex, plantData);
        
        console.log(`🏆 DEBUG: ${plantData.seedName} in pot ${potIndex} is ready for harvest!`);
    }

    harvestPlant(potIndex) {
        console.log('🌾 DEBUG: harvestPlant called for pot', potIndex);
        
        const plantData = this.growingPlants.get(potIndex);
        if (!plantData) {
            console.error('❌ DEBUG: No plant data found for pot', potIndex);
            return;
        }
        
        // 🫘 REMOVE BEANS FIRST!
        this.removeBeansFromVine(potIndex);
        
        // Remove clipper if it exists
        this.removeClipper(potIndex);
        
        // Remove vine element
        if (plantData.vineElement) {
            plantData.vineElement.remove();
            console.log('🌾 DEBUG: Vine element removed');
        }
        
        // Reset pot state
        if (this.pots[potIndex]) {
            this.pots[potIndex].state = 'empty';
            this.pots[potIndex].data = { state: 'empty' };
            
            const potElement = document.querySelector(`[data-pot-index="${potIndex}"]`);
            if (potElement) {
                potElement.className = 'pot';
            }
        }
        
        // Remove from growing plants tracking
        this.growingPlants.delete(potIndex);
        
        // TODO: Add harvested plant to inventory or give coins
        console.log(`🌾 DEBUG: Harvested ${plantData.seedName} from pot ${potIndex}!`);
        alert(`Harvested ${plantData.seedName}! 🌾\n\n(Harvesting rewards coming soon!)`);
    }

    // Plant growth data and vine mapping
    getPlantGrowthData() {
        return {
            'Beanstalk': { growthTime: 25, vineImage: 'Assets/Vines/Beanstalkvine.png', type: 'Picker' },
            'Snap Pea': { growthTime: 75, vineImage: 'Assets/Vines/peaseedvine.png', type: 'Picker' },
            'Jellybean Vine': { growthTime: 90, vineImage: 'Assets/Vines/Jellybeanvine.png', type: 'Picker' },
            'Bamboo-Bean': { growthTime: 120, vineImage: 'Assets/Vines/bamboovine.png', type: 'Cutter' },
            'Coffee Beanstalk': { growthTime: 120, vineImage: 'Assets/Vines/Coffebeanvine.png', type: 'Picker' },
            'Thunder Pod': { growthTime: 150, vineImage: 'Assets/Vines/Thunderpodvine.png', type: 'Cutter' },
            'Frost Pea': { growthTime: 150, vineImage: 'Assets/Vines/frostvine.png', type: 'Picker' },
            'Choco Vine': { growthTime: 180, vineImage: 'Assets/Vines/Chocovine.png', type: 'Picker' },
            'Ironvine': { growthTime: 210, vineImage: 'Assets/Vines/Ironvine.png', type: 'Cutter' },
            'Honeyvine': { growthTime: 180, vineImage: 'Assets/Vines/Honeyvine.png', type: 'Picker' },
            'Sunbean': { growthTime: 240, vineImage: 'Assets/Vines/Sunbeanvine.png', type: 'Picker' },
            'Moonbean': { growthTime: 240, vineImage: 'Assets/Vines/moonbeanvine.png', type: 'Picker' },
            'Cloud Creeper': { growthTime: 270, vineImage: 'Assets/Vines/Cloudvine.png', type: 'Picker' },
            'Royal Stalk': { growthTime: 300, vineImage: 'Assets/Vines/Royalstalkvine.png', type: 'Cutter' },
            'Crystal Bean': { growthTime: 300, vineImage: 'Assets/Vines/Crystalbeanvine.png', type: 'Picker' },
            'Neon Soy': { growthTime: 330, vineImage: 'Assets/Vines/Neonsoyvine.png', type: 'Cutter' },
            'Vinecorn': { growthTime: 240, vineImage: 'Assets/Vines/Cornvine.png', type: 'Cutter' },
            'Fire Pod': { growthTime: 360, vineImage: 'Assets/Vines/Firepodvine.png', type: 'Cutter' },
            'Shadow Bean': { growthTime: 300, vineImage: 'Assets/Vines/Shadowbeanvine.png', type: 'Picker' },
            'Prism Stalk': { growthTime: 480, vineImage: 'Assets/Vines/Prysmvine.png', type: 'Picker' }
        };
    }

    // Bean mapping for different plant types
    getBeanImageForPlant(plantName) {
        const beanMapping = {
            'Beanstalk': 'Assets/BasicBeans/beanstalkbean.png', // Correct bean for basic beanstalk
            'Snap Pea': 'Assets/BasicBeans/Snappeabean.png',
            'Jellybean Vine': 'Assets/BasicBeans/Jellybean.png',
            'Bamboo-Bean': 'Assets/BasicBeans/Bamboobean.png',
            'Coffee Beanstalk': 'Assets/BasicBeans/Coffebean.png',
            'Thunder Pod': 'Assets/BasicBeans/Thunderboltpeabean.png',
            'Frost Pea': 'Assets/BasicBeans/Frostbean.png',
            'Choco Vine': 'Assets/BasicBeans/Chocobean.png',
            'Ironvine': 'Assets/BasicBeans/Ironbean.png',
            'Honeyvine': 'Assets/BasicBeans/Honeybean.png',
            'Sunbean': 'Assets/BasicBeans/Sunbean.png',
            'Moonbean': 'Assets/BasicBeans/Moombean.png',
            'Cloud Creeper': 'Assets/BasicBeans/Cloudbean.png',
            'Royal Stalk': 'Assets/BasicBeans/Royalbean.png',
            'Crystal Bean': 'Assets/BasicBeans/Crystalbean.png',
            'Neon Soy': 'Assets/BasicBeans/Neonbean.png',
            'Vinecorn': 'Assets/BasicBeans/Cornbean.png',
            'Fire Pod': 'Assets/BasicBeans/Firebean.png',
            'Shadow Bean': 'Assets/BasicBeans/Shadowbean.png',
            'Prism Stalk': 'Assets/BasicBeans/Prysmbean.png'
        };
        
        return beanMapping[plantName] || 'Assets/BasicBeans/Jellybean.png'; // Default fallback
    }

    // Get spawn interval based on plant rarity and level - level increases spawn rate
    getSpawnIntervalForPlant(plantName, potIndex = -1) {
        // Plant rarity mapping based on Setup.py PLANT_SPECIES
        const plantRarityMap = {
            // Common - base 3 seconds (level 1), gets faster with level
            'Beanstalk': 'common',
            'Snap Pea': 'common',
            
            // Uncommon - base 6 seconds
            'Jellybean Vine': 'uncommon',
            'Bamboo-Bean': 'uncommon', 
            'Coffee Beanstalk': 'uncommon',
            
            // Rare - base 12 seconds
            'Thunder Pod': 'rare',
            'Frost Pea': 'rare',
            'Choco Vine': 'rare',
            
            // Legendary - base 24 seconds
            'Ironvine': 'legendary',
            'Honeyvine': 'legendary',
            'Sunbean': 'legendary',
            
            // Mythical - base 48 seconds
            'Moonbean': 'mythical',
            'Cloud Creeper': 'mythical',
            
            // Ultra-Mythical - base 96 seconds
            'Royal Stalk': 'ultra_mythical',
            'Crystal Bean': 'ultra_mythical', 
            'Neon Soy': 'ultra_mythical',
            
            // Godly - base 180 seconds (3 minutes)
            'Vinecorn': 'godly',
            'Fire Pod': 'godly',
            'Shadow Bean': 'godly', 
            'Prism Stalk': 'godly'
        };
        
        // BASE intervals (in milliseconds) - much more reasonable but still scaled by rarity
        const rarityBaseIntervals = {
            'common': 8000,        // 8 seconds base (much slower)
            'uncommon': 15000,     // 15 seconds base 
            'rare': 30000,         // 30 seconds base
            'legendary': 60000,    // 60 seconds base
            'mythical': 120000,    // 2 minutes base
            'ultra_mythical': 240000, // 4 minutes base
            'godly': 480000        // 8 minutes base
        };
        
        const rarity = plantRarityMap[plantName] || 'common';
        let baseInterval = rarityBaseIntervals[rarity] || 8000;
        
        // Apply level-based speed multiplier
        let levelMultiplier = 1.0;
        if (potIndex >= 0 && this.pots && this.pots[potIndex] && this.pots[potIndex].multipliers) {
            // Use spawn_rate multiplier: 1.0x at level 1, 2.0x at level 25
            levelMultiplier = this.pots[potIndex].multipliers.spawn_rate;
        } else if (potIndex >= 0 && this.pots && this.pots[potIndex] && this.pots[potIndex].level) {
            // Fallback calculation if multipliers not available
            const level = this.pots[potIndex].level;
            levelMultiplier = 1.0 + (level - 1) * 1.0 / 24; // 1.0x to 2.0x
        }
        
        // Higher multiplier = faster spawning = lower interval
        const finalInterval = Math.floor(baseInterval / levelMultiplier);
        
        console.log(`🕐 DEBUG: ${plantName} (${rarity}) Level ${this.pots && this.pots[potIndex] ? this.pots[potIndex].level || 1 : 1} - Base: ${baseInterval/1000}s, Speed: ${levelMultiplier.toFixed(2)}x, Final: ${finalInterval/1000}s`);
        return finalInterval;
    }

    // Bean value mapping based on plant types with rarity and size multipliers
    getBeanValueForPlant(plantName, rarity = 'none', size = 'normal', potIndex = -1) {
        const beanValues = {
            'Beanstalk': () => 12 + Math.floor(Math.random() * 5), // 12-16 random
            'Snap Pea': 90,
            'Jellybean Vine': 170,
            'Bamboo-Bean': 300,
            'Coffee Beanstalk': 540,
            'Thunder Pod': 970,
            'Frost Pea': 2700,
            'Choco Vine': 3500,
            'Ironvine': 15300,
            'Honeyvine': 19300,
            'Sunbean': 25500,
            'Moonbean': 43000,
            'Cloud Creeper': 49000,
            'Royal Stalk': 86000,
            'Crystal Bean': 120000,
            'Neon Soy': 160000,
            'Vinecorn': 210000,
            'Fire Pod': 280000,
            'Shadow Bean': 320000,
            'Prism Stalk': 340000
        };
        
        let baseValue = beanValues[plantName];
        if (typeof baseValue === 'function') {
            baseValue = baseValue();
        } else if (!baseValue) {
            baseValue = 10;
        }
        
        // Apply plant level money multiplier (0.5x at level 1, 1.0x at level 25)
        let levelMultiplier = 1.0;
        if (potIndex >= 0 && this.pots && this.pots[potIndex] && this.pots[potIndex].multipliers) {
            levelMultiplier = this.pots[potIndex].multipliers.money;
        } else if (potIndex >= 0 && this.pots && this.pots[potIndex] && this.pots[potIndex].level) {
            // Fallback calculation if multipliers not available
            const level = this.pots[potIndex].level;
            levelMultiplier = 0.5 + (level - 1) * 0.5 / 24;
        }
        
        // Apply rarity multipliers
        let rarityMultiplier = 1.0;
        if (rarity === 'shiny') {
            rarityMultiplier = 3.0; // 200% more valuable (3x multiplier) - 1.5% chance
        } else if (rarity === 'golden') {
            rarityMultiplier = 6.0; // 500% more valuable (6x multiplier) - 1.5% chance
        }
        
        // Apply size multipliers (compound with rarity!)
        let sizeMultiplier = 1.0;
        if (size === 'big') {
            sizeMultiplier = 3.0; // 200% more valuable (3x multiplier) - 2% chance
        } else if (size === 'massive') {
            sizeMultiplier = 6.0; // 500% more valuable (6x multiplier) - 0.5% chance
        }
        
        const totalMultiplier = levelMultiplier * rarityMultiplier * sizeMultiplier;
        const finalValue = Math.floor(baseValue * totalMultiplier);
        
        console.log(`💰 DEBUG: ${plantName} bean - Base: ${baseValue}, Level: ${levelMultiplier.toFixed(2)}x, Rarity: ${rarity} (${rarityMultiplier}x), Size: ${size} (${sizeMultiplier}x), Final: ${finalValue}`);
        
        // Log special beans for excitement!
        if (rarity !== 'none' || size !== 'normal') {
            const rarityName = rarity === 'shiny' ? 'SILVER SHINY' : rarity === 'golden' ? 'GOLDEN' : '';
            const sizeName = size === 'big' ? 'BIG' : size === 'massive' ? 'MASSIVE' : '';
            const specialName = [sizeName, rarityName].filter(name => name).join(' ');
            console.log(`✨ ${specialName} BEAN! ${plantName} worth ${finalValue} coins (${totalMultiplier}x total multiplier!)`);
        }
        
        return finalValue;
    }

    // Get detailed seed information for tooltips
    getSeedInfo(seedName) {
        const seedData = {
            'Beanstalk': { 
                growthTime: 25, type: 'Picker', rarity: 'common', 
                sellValue: '12-16', cost: 120, 
                description: 'A humble beginning to your farming empire.' 
            },
            'Snap Pea': { 
                growthTime: 75, type: 'Picker', rarity: 'common', 
                sellValue: '90', cost: 560, 
                description: 'Quick to grow, satisfying to harvest.' 
            },
            'Jellybean Vine': { 
                growthTime: 90, type: 'Picker', rarity: 'uncommon', 
                sellValue: '170', cost: 1285, 
                description: 'Sweet rewards for patient gardeners.' 
            },
            'Bamboo-Bean': { 
                growthTime: 120, type: 'Cutter', rarity: 'uncommon', 
                sellValue: '300', cost: 5410, 
                description: 'Strong and resilient, like bamboo itself.' 
            },
            'Coffee Beanstalk': { 
                growthTime: 120, type: 'Picker', rarity: 'uncommon', 
                sellValue: '540', cost: 9300, 
                description: 'Energizing profits from caffeine-rich beans.' 
            },
            'Thunder Pod': { 
                growthTime: 150, type: 'Cutter', rarity: 'rare', 
                sellValue: '970', cost: 17000, 
                description: 'Electrifying yields that strike like lightning.' 
            },
            'Frost Pea': { 
                growthTime: 150, type: 'Picker', rarity: 'rare', 
                sellValue: '2,700', cost: 31000, 
                description: 'Cool profits from icy cold harvests.' 
            },
            'Choco Vine': { 
                growthTime: 180, type: 'Picker', rarity: 'rare', 
                sellValue: '3,500', cost: 35200, 
                description: 'Sweet as chocolate, rich as gold.' 
            },
            'Ironvine': { 
                growthTime: 210, type: 'Cutter', rarity: 'legendary', 
                sellValue: '15,300', cost: 90000, 
                description: 'Forged in nature, stronger than steel.' 
            },
            'Honeyvine': { 
                growthTime: 180, type: 'Picker', rarity: 'legendary', 
                sellValue: '19,300', cost: 180000, 
                description: 'Golden nectar flows from these vines.' 
            },
            'Sunbean': { 
                growthTime: 240, type: 'Picker', rarity: 'legendary', 
                sellValue: '25,500', cost: 193000, 
                description: 'Harness the power of the sun itself.' 
            },
            'Moonbean': { 
                growthTime: 240, type: 'Picker', rarity: 'mythical', 
                sellValue: '43,000', cost: 253000, 
                description: 'Mystical beans blessed by lunar energy.' 
            },
            'Cloud Creeper': { 
                growthTime: 270, type: 'Picker', rarity: 'mythical', 
                sellValue: '49,000', cost: 295000, 
                description: 'Floating profits from sky-high yields.' 
            },
            'Royal Stalk': { 
                growthTime: 300, type: 'Cutter', rarity: 'ultra-mythical', 
                sellValue: '86,000', cost: 465000, 
                description: 'Fit for kings, priced for emperors.' 
            },
            'Crystal Bean': { 
                growthTime: 300, type: 'Picker', rarity: 'ultra-mythical', 
                sellValue: '120,000', cost: 600000, 
                description: 'Crystalline perfection in bean form.' 
            },
            'Neon Soy': { 
                growthTime: 330, type: 'Cutter', rarity: 'ultra-mythical', 
                sellValue: '160,000', cost: 570000, 
                description: 'Glowing with otherworldly profits.' 
            },
            'Vinecorn': { 
                growthTime: 240, type: 'Cutter', rarity: 'godly', 
                sellValue: '210,000', cost: 1200000, 
                description: 'Divine fusion of vine and grain.' 
            },
            'Fire Pod': { 
                growthTime: 360, type: 'Cutter', rarity: 'godly', 
                sellValue: '280,000', cost: 1800000, 
                description: 'Burning bright with eternal flame.' 
            },
            'Shadow Bean': { 
                growthTime: 300, type: 'Picker', rarity: 'godly', 
                sellValue: '320,000', cost: 3182000, 
                description: 'Dark power yields illuminating profits.' 
            },
            'Prism Stalk': { 
                growthTime: 480, type: 'Picker', rarity: 'godly', 
                sellValue: '340,000', cost: 5620000, 
                description: 'Refracts light into pure prosperity.' 
            }
        };
        
        return seedData[seedName] || {
            growthTime: 60, type: 'Unknown', rarity: 'common', 
            sellValue: '?', cost: 0, description: 'Mystery seed with unknown properties.'
        };
    }

    // Create and show seed tooltip
    createSeedTooltip() {
        if (this.seedTooltip) return;
        
        this.seedTooltip = document.createElement('div');
        this.seedTooltip.className = 'seed-tooltip';
        document.body.appendChild(this.seedTooltip);
    }

    // Show seed tooltip with information
    showSeedTooltip(seedItem, anchorX, anchorY) {
        if (!this.seedTooltip) this.createSeedTooltip();
        
        const seedInfo = this.getSeedInfo(seedItem.name);
        
        this.seedTooltip.innerHTML = `
            <div class="tooltip-header">
                <div class="tooltip-icon" style="background-image: url('${seedItem.image}')"></div>
                <div class="tooltip-title">
                    <h3 class="tooltip-name">${seedItem.name}</h3>
                    <p class="tooltip-rarity ${seedInfo.rarity}">${seedInfo.rarity}</p>
                </div>
            </div>
            <div class="tooltip-stats">
                <div class="tooltip-stat">
                    <span class="stat-icon">⏰</span>
                    <span>${seedInfo.growthTime}s</span>
                </div>
                <div class="tooltip-stat">
                    <span class="stat-icon">💰</span>
                    <span>$${seedInfo.sellValue}</span>
                </div>
                <div class="tooltip-stat">
                    <span class="stat-icon">${seedInfo.type === 'Picker' ? '✋' : '✂️'}</span>
                    <span>${seedInfo.type}</span>
                </div>
                <div class="tooltip-stat">
                    <span class="stat-icon">📦</span>
                    <span>×${seedItem.quantity}</span>
                </div>
            </div>
            <div class="tooltip-description">${seedInfo.description}</div>
        `;
        
        // Show tooltip first to get accurate dimensions
        this.seedTooltip.style.visibility = 'hidden';
        this.seedTooltip.classList.add('visible');
        
        // Now get accurate dimensions for positioning
        const tooltipRect = this.seedTooltip.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Start with tooltip to the right of the anchor point
        let tooltipX = anchorX;
        let tooltipY = anchorY - (tooltipRect.height / 2); // Center vertically on the item
        
        // If tooltip goes off the right edge, show it on the left side
        if (tooltipX + tooltipRect.width > screenWidth - 20) {
            tooltipX = anchorX - tooltipRect.width - 20;
        }
        
        // If tooltip goes off the bottom, push it up
        if (tooltipY + tooltipRect.height > screenHeight - 20) {
            tooltipY = screenHeight - tooltipRect.height - 20;
        }
        
        // If tooltip goes off the top, push it down
        if (tooltipY < 20) {
            tooltipY = 20;
        }
        
        // Apply final position and make visible
        this.seedTooltip.style.left = tooltipX + 'px';
        this.seedTooltip.style.top = tooltipY + 'px';
        this.seedTooltip.style.visibility = 'visible';
    }

    // Hide seed tooltip
    hideSeedTooltip() {
        if (this.seedTooltip) {
            this.seedTooltip.classList.remove('visible');
        }
    }

    // Create level bar for a plant
    createPlantLevelBar(potIndex, level, experience, requiredXP) {
        console.log(`🎯 createPlantLevelBar called for pot ${potIndex}`);
        
        // Remove any existing level bars everywhere
        document.querySelectorAll(`#level-bar-${potIndex}`).forEach(bar => {
            console.log('Removing existing bar:', bar);
            bar.remove();
        });
        document.querySelectorAll('.plant-level-bar').forEach(bar => {
            if (bar.id === `level-bar-${potIndex}` || bar.closest(`#pot-${potIndex}`)) {
                bar.remove();
            }
        });
        
        // Create level bar container
        const levelBar = document.createElement('div');
        levelBar.id = `level-bar-${potIndex}`;
        levelBar.className = 'plant-level-bar visible';
        levelBar.style.cssText = `
            position: absolute;
            top: -15px;
            left: 50%;
            transform: translateX(-50%);
            width: 120px;
            height: 20px;
            background: linear-gradient(to bottom, rgba(30, 30, 30, 1), rgba(10, 10, 10, 1));
            border-radius: 10px;
            border: 3px solid #FFD700;
            z-index: 9999;
            display: block !important;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.8), 0 5px 15px rgba(0, 0, 0, 0.9);
        `;
        
        // Create level indicator
        const levelIndicator = document.createElement('div');
        levelIndicator.className = 'plant-level-indicator';
        
        // Check if clippers are unlocked for this pot
        const potData = this.pots[potIndex];
        if (potData && potData.clipper_unlocked) {
            levelIndicator.textContent = `Lv.${level} | ✂️ ${potData.clipper_level || 1}`;
        } else {
            levelIndicator.textContent = `Lv.${level}`;
        }
        
        levelIndicator.style.cssText = `
            position: absolute;
            top: -25px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 18px;
            font-weight: 900;
            color: #FFD700;
            text-shadow: 3px 3px 6px rgba(0, 0, 0, 1), -2px -2px 4px rgba(0, 0, 0, 1), 0 0 15px rgba(255, 215, 0, 1);
            z-index: 10000;
            background: linear-gradient(to bottom, rgba(50, 50, 50, 0.95), rgba(0, 0, 0, 0.95));
            padding: 4px 10px;
            border-radius: 10px;
            border: 2px solid #FFD700;
            white-space: nowrap;
        `;
        levelBar.appendChild(levelIndicator);
        
        // Create progress bar
        const progressBar = document.createElement('div');
        progressBar.className = 'plant-level-bar-fill';
        progressBar.style.cssText = `
            height: 100%;
            background: linear-gradient(90deg, #00FF00, #7FFF00, #FFFF00);
            border-radius: 7px;
            transition: width 0.3s ease;
            width: ${requiredXP > 0 ? Math.min(100, (experience / requiredXP) * 100) : 100}%;
            box-shadow: inset 0 0 10px rgba(255, 255, 0, 0.3);
        `;
        levelBar.appendChild(progressBar);
        
        // Try multiple parent elements
        const pot = document.getElementById(`pot-${potIndex}`);
        const plantData = this.growingPlants.get(potIndex);
        
        if (plantData && plantData.vineElement && plantData.vineElement.parentNode) {
            // Vine exists and is in DOM
            plantData.vineElement.appendChild(levelBar);
            console.log('✅✅✅ Level bar added to VINE for pot', potIndex);
        } else if (pot) {
            // Fallback to pot
            pot.appendChild(levelBar);
            console.log('✅✅✅ Level bar added to POT', potIndex);
        } else {
            console.error('❌❌❌ Could not find parent element for level bar!');
        }
        
        return levelBar;
    }

    // Update plant level bar
    updatePlantLevelBar(potIndex, level, experience, requiredXP, animated = false) {
        // Try to find existing level bar
        let levelBar = document.getElementById(`level-bar-${potIndex}`);
        
        // If not found, create it
        if (!levelBar) {
            console.log('📊 DEBUG: Creating level bar for pot', potIndex);
            this.createPlantLevelBar(potIndex, level, experience, requiredXP);
            return;
        }
        
        // Update level indicator - show clipper level if unlocked
        const levelIndicator = levelBar.querySelector('.plant-level-indicator');
        if (levelIndicator) {
            const pot = this.pots[potIndex];
            if (pot && pot.clipper_unlocked) {
                // Show both plant and clipper level
                levelIndicator.textContent = `Lv.${level} | ✂️ ${pot.clipper_level || 1}`;
            } else {
                levelIndicator.textContent = `Lv.${level}`;
            }
        }
        
        // Update progress bar
        const progressBar = levelBar.querySelector('.plant-level-bar-fill');
        if (progressBar) {
            const experiencePercent = requiredXP > 0 ? Math.min(100, (experience / requiredXP) * 100) : 100;
            
            // Smooth transition with glow effect during animation
            progressBar.style.transition = 'width 0.6s ease-out, box-shadow 0.6s ease';
            progressBar.style.width = `${experiencePercent}%`;
            
            // Add temporary glow to show progress change
            if (animated) {
                progressBar.style.boxShadow = 'inset 0 0 20px rgba(0, 255, 0, 0.8), 0 0 10px rgba(255, 255, 0, 0.6)';
                setTimeout(() => {
                    progressBar.style.boxShadow = 'inset 0 0 10px rgba(255, 255, 0, 0.3)';
                }, 600);
            }
        }
        
        // Always show level bar for planted crops
        levelBar.classList.add('visible');
    }

    // Add experience to a clipper
    async addClipperExperience(instanceId, xpAmount = 0.5) {
        try {
            const response = await fetch('/api/add-clipper-experience', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    instance_id: instanceId,
                    xp_amount: xpAmount
                })
            });
            
            const data = await response.json();
            
            if (data.success && data.result && data.result.leveled_up) {
                console.log(`✂️ Clipper leveled up to ${data.result.new_level}!`);
                // Update pots data
                this.pots = data.pots;
                this.updateAllPlantLevelBars();
                
                // Update clipper speed
                const potIndex = this.pots.findIndex(p => p.instance_id === instanceId);
                if (potIndex >= 0) {
                    this.createOrUpdateClipper(potIndex, data.result.new_level);
                }
            }
            
            return data;
        } catch (error) {
            console.error('Error adding clipper experience:', error);
            return null;
        }
    }
    
    // Add experience to a plant
    async addPlantExperience(instanceId, xpAmount = 1) {
        try {
            const response = await fetch('/api/add-plant-experience', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    instance_id: instanceId,
                    xp_amount: xpAmount
                })
            });
            
            const data = await response.json();
            if (data.success && data.result.leveled_up) {
                // Update pots data FIRST with new leveling info
                this.pots = data.pots;
                this.updateAllPlantLevelBars();
                
                // Show level up notification - NO MORE PRESTIGE BULLSHIT
                this.showLevelUpNotification(data.result.old_level, data.result.new_level);
                
                // Check for clipper unlock at level 25 (PERMANENT, NO RESET)
                if (data.result.new_level === 25 && data.result.clipper_unlocked) {
                    // Show clipper unlock notification
                    this.showClipperUnlockNotification();
                    
                    // Create clipper for this pot
                    const potIndex = this.pots.findIndex(p => p.instance_id === instanceId);
                    if (potIndex >= 0) {
                        console.log(`✂️ Level 25! Creating clipper for pot ${potIndex}`);
                        this.createOrUpdateClipper(potIndex, 1);
                    }
                }
            }
            
            return data;
        } catch (error) {
            console.error('❌ Error adding plant experience:', error);
            return null;
        }
    }

    // Show level up notification (disabled - no popup)
    showLevelUpNotification(oldLevel, newLevel) {
        console.log(`🎉 Plant leveled up from ${oldLevel} to ${newLevel}!`);
        // Orange popup removed - only console log remains
        return;
    }

    // Show prestige notification when reaching level 25
    showPrestigeNotification(clipperLevel) {
        console.log(`🌟 PRESTIGE! Plant reset to level 1 with Clipper Level ${clipperLevel}!`);
        
        // Play level up sound
        this.playSound('levelup');
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #9b59b6, #8e44ad);
            color: white;
            padding: 30px 40px;
            border-radius: 20px;
            font-size: 24px;
            font-weight: bold;
            box-shadow: 0 10px 40px rgba(155, 89, 182, 0.5);
            z-index: 10000;
            text-align: center;
            animation: prestigeBurst 3s ease-out forwards;
            border: 3px solid gold;
        `;
        
        notification.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 10px;">🌟 PRESTIGE! 🌟</div>
            <div style="font-size: 20px; margin-bottom: 10px;">Level Reset to 1</div>
            <div style="font-size: 18px; color: gold;">✂️ Clipper Level ${clipperLevel} Activated! ✂️</div>
            <div style="font-size: 14px; margin-top: 10px; opacity: 0.9;">Auto-harvesting beans with enhanced speed!</div>
        `;
        
        // Add animation styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes prestigeBurst {
                0% { 
                    transform: translate(-50%, -50%) scale(0.3) rotate(0deg); 
                    opacity: 0; 
                }
                50% { 
                    transform: translate(-50%, -50%) scale(1.3) rotate(5deg); 
                    opacity: 1; 
                }
                70% {
                    transform: translate(-50%, -50%) scale(0.95) rotate(-2deg);
                }
                100% { 
                    transform: translate(-50%, -50%) scale(1) rotate(0deg); 
                    opacity: 0; 
                }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 3000);
    }

    // Show clipper unlock notification
    showClipperUnlockNotification() {
        console.log('✂️ Clippers unlocked!');
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 60%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #9b59b6, #8e44ad);
            color: white;
            padding: 20px 30px;
            border-radius: 15px;
            font-size: 18px;
            font-weight: bold;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: clipperUnlock 3s ease-out forwards;
        `;
        notification.textContent = '✂️ Auto-Clippers Unlocked! Level 25 Reached!';
        
        // Add animation styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes clipperUnlock {
                0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
                20% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                80% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 3000);
    }

    // Update all plant level bars from current pot data
    updateAllPlantLevelBars() {
        if (!this.pots) return;
        
        console.log('🎯 DEBUG: updateAllPlantLevelBars called');
        
        this.pots.forEach((pot, index) => {
            if (pot.instance_id && (pot.state === 'growing' || pot.state === 'ready')) {
                // Default level 1 if not present (for newly planted crops)
                const level = pot.level || 1;
                const experience = pot.experience || 0;
                const requiredXP = pot.required_xp || 100;
                
                console.log(`🎯 DEBUG: Creating level bar for pot ${index}: Level ${level}, State: ${pot.state}`);
                // Always create level bar, don't just update
                this.createPlantLevelBar(index, level, experience, requiredXP);
                
                // Create/update clippers if level 25 and unlocked
                if (level >= 25 && pot.clipper_unlocked) {
                    this.createOrUpdateClipper(index, pot.clipper_level || 0);
                }
            }
        });
    }

    // Create or update clipper for a plant
    createOrUpdateClipper(potIndex, clipperLevel) {
        const pot = document.getElementById(`pot-${potIndex}`);
        if (!pot) return;
        
        let clipper = pot.querySelector('.plant-clipper');
        
        if (!clipper) {
            // Create new clipper
            clipper = document.createElement('div');
            clipper.className = 'plant-clipper';
            clipper.textContent = '✂️';
            clipper.dataset.potIndex = potIndex;
            
            // Position clipper at pot center initially
            clipper.style.left = '50px'; // Center of pot
            clipper.style.top = '30px'; // Above pot center
            clipper.style.position = 'absolute';
            clipper.style.fontSize = '24px'; // Make it bigger and more visible
            clipper.style.zIndex = '25'; // Above beans
            clipper.style.pointerEvents = 'none';
            clipper.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)'; // Smooth movement
            
            pot.appendChild(clipper);
            
            // Start clipper movement and collection
            this.startClipperMovement(potIndex, clipper);
        }
        
        // Update clipper based on level (faster movement at higher levels)
        const speed = 2500 - (clipperLevel * 60); // 2.5s at level 1, faster at higher levels
        clipper.dataset.speed = Math.max(800, speed);
        clipper.dataset.level = clipperLevel;
        
        console.log(`✂️ DEBUG: Clipper for pot ${potIndex} level ${clipperLevel || 1}, speed: ${clipper.dataset.speed}ms`);
    }

    // Start clipper movement and collection behavior
    startClipperMovement(potIndex, clipperElement) {
        // Stop any existing interval
        if (clipperElement.dataset.intervalId) {
            clearInterval(parseInt(clipperElement.dataset.intervalId));
        }
        
        const collectBeans = () => {
            // Check if clipper still exists and pot is still ready
            if (!clipperElement || !clipperElement.parentNode) {
                return;
            }
            
            const potState = this.pots[potIndex]?.state;
            if (potState !== 'ready' && potState !== 'growing') {
                console.log(`✂️ DEBUG: Stopping clipper - pot state is ${potState}`);
                return;
            }
            
            // Find beans around this plant
            const beans = document.querySelectorAll(`[data-pot-index="${potIndex}"].vine-bean:not(.flying-to-money):not(.clicked)`);
            
            if (beans.length > 0) {
                // Find the closest bean to current clipper position
                const pot = document.getElementById(`pot-${potIndex}`);
                const potRect = pot.getBoundingClientRect();
                const clipperRect = clipperElement.getBoundingClientRect();
                const clipperCenterX = clipperRect.left + clipperRect.width / 2;
                const clipperCenterY = clipperRect.top + clipperRect.height / 2;
                
                let closestBean = null;
                let closestDistance = Infinity;
                
                beans.forEach(bean => {
                    const beanRect = bean.getBoundingClientRect();
                    const beanCenterX = beanRect.left + beanRect.width / 2;
                    const beanCenterY = beanRect.top + beanRect.height / 2;
                    
                    const distance = Math.sqrt(
                        Math.pow(beanCenterX - clipperCenterX, 2) + 
                        Math.pow(beanCenterY - clipperCenterY, 2)
                    );
                    
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestBean = bean;
                    }
                });
                
                if (closestBean) {
                    const beanRect = closestBean.getBoundingClientRect();
                    
                    // Calculate position relative to pot
                    const targetX = beanRect.left - potRect.left + (beanRect.width / 2) - 12; // Center on bean
                    const targetY = beanRect.top - potRect.top + (beanRect.height / 2) - 12;
                    
                    // Move clipper smoothly toward the bean
                    clipperElement.style.left = targetX + 'px';
                    clipperElement.style.top = targetY + 'px';
                    
                    // Add rotation for visual effect
                    const angle = Math.atan2(targetY - parseInt(clipperElement.style.top), targetX - parseInt(clipperElement.style.left));
                    clipperElement.style.transform = `rotate(${angle}rad)`;
                    
                    // Collect the bean after movement completes
                    setTimeout(() => {
                        if (closestBean.parentNode && !closestBean.classList.contains('flying-to-money') && !closestBean.classList.contains('clicked')) {
                            // Mark as clipper collected to prevent double collection
                            closestBean.dataset.clipperCollected = 'true';
                            closestBean.classList.add('clicked');
                            
                            // Get plant name from growing plants data
                            const plantData = this.growingPlants.get(potIndex);
                            const plantName = plantData ? plantData.continuousSpawning?.plantName || plantData.seedName || 'Unknown Plant' : 'Unknown Plant';
                            
                            // Collect the bean normally (this gives money)
                            this.collectBean(closestBean, plantName);
                            
                            // Auto-clippers give XP to the clipper itself, not the plant
                            if (this.pots && this.pots[potIndex] && this.pots[potIndex].instance_id) {
                                const instanceId = this.pots[potIndex].instance_id;
                                // Add clipper XP
                                this.addClipperExperience(instanceId, 0.5);
                            }
                            
                            console.log(`✂️ Clipper collected bean from ${plantName}`);
                        }
                    }, 800); // Wait for movement to complete
                }
            } else {
                // No beans, move in a circular pattern around the pot
                const time = Date.now() / 2000;
                const radius = 40;
                const centerX = 50;
                const centerY = 30;
                
                const x = centerX + Math.cos(time) * radius;
                const y = centerY + Math.sin(time) * radius;
                
                clipperElement.style.left = x + 'px';
                clipperElement.style.top = y + 'px';
                clipperElement.style.transform = `rotate(${time}rad)`;
            }
        };
        
        // Run collection check immediately
        collectBeans();
        
        // Schedule regular collection checks
        const speed = parseInt(clipperElement.dataset.speed) || 2000;
        const intervalId = setInterval(collectBeans, speed);
        
        // Store interval ID for cleanup
        clipperElement.dataset.intervalId = intervalId;
        
        console.log(`✂️ Started clipper movement for pot ${potIndex}, checking every ${speed}ms`);
    }

    // Remove clipper when plant is harvested/burned
    removeClipper(potIndex) {
        const pot = document.getElementById(`pot-${potIndex}`);
        if (!pot) return;
        
        const clipper = pot.querySelector('.plant-clipper');
        if (clipper) {
            clipper.remove();
            console.log(`✂️ DEBUG: Removed clipper for pot ${potIndex}`);
        }
    }

    // Create plant instance on backend when planting from inventory
    async createPlantInstanceOnBackend(potIndex, plantName) {
        try {
            const response = await fetch('/api/plant-from-inventory', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    species_name: plantName,
                    pot_index: potIndex
                })
            });

            const result = await response.json();
            if (result.success) {
                // Update pots data with the leveling information
                this.pots = result.pots; // This contains the leveling data!
                
                // Create level bar for the newly planted crop
                setTimeout(() => {
                    const potData = this.pots[potIndex];

                    if (potData && potData.instance_id) {
                        this.createPlantLevelBar(potIndex, potData.level || 1, potData.experience || 0, potData.required_xp || 100);
                        console.log(`🌱 DEBUG: Created level bar for ${plantName} - Level: ${potData.level}, XP: ${potData.experience}/${potData.required_xp}`);
                    }
                }, 500); // Longer delay to ensure DOM is ready
                
                console.log(`✅ Successfully created plant instance for ${plantName} in pot ${potIndex}`);
                return true;
            } else {
                console.error('❌ Failed to create plant instance on backend:', result.message);
                return false;
            }
        } catch (error) {
            console.error('❌ Error creating plant instance:', error);
            return false;
        }
    }

    // Spawn beans around a grown beanstalk
    spawnBeansAroundVine(potIndex, plantName, vineElement) {
        console.log('🫘 DEBUG: spawnBeansAroundVine called for', plantName, 'in pot', potIndex);
        
        // ENSURE LEVEL BAR EXISTS!
        const levelBar = document.getElementById(`level-bar-${potIndex}`);
        if (!levelBar && this.pots[potIndex]) {
            console.log('🚨🚨🚨 NO LEVEL BAR WHEN SPAWNING BEANS! Creating it NOW!');
            const potData = this.pots[potIndex];
            this.createPlantLevelBar(
                potIndex, 
                potData.level || 1, 
                potData.experience || 0, 
                potData.required_xp || 100
            );
        }
        
        // Check if beans are already spawning for this vine
        const plantData = this.growingPlants.get(potIndex);
        if (plantData && plantData.isSpawningBeans) {
            console.log('🫘 DEBUG: Beans already spawning for pot', potIndex);
            return;
        }
        
        const beanImage = this.getBeanImageForPlant(plantName);
        const potsContainer = document.getElementById('potsContainer');
        
        if (!potsContainer || !vineElement) {
            console.error('❌ DEBUG: Missing potsContainer or vineElement');
            return;
        }
        
        // Mark as spawning to prevent duplicate calls
        if (plantData) {
            plantData.isSpawningBeans = true;
            plantData.beanCount = 0;
            plantData.beanSpawnIndex = 0; // Track spawn index for unique IDs
            this.growingPlants.set(potIndex, plantData);
        }
        
        // Get vine position
        const vineRect = vineElement.getBoundingClientRect();
        const containerRect = potsContainer.getBoundingClientRect();
        
        // Calculate relative position
        const vineX = vineRect.left - containerRect.left + (vineRect.width / 2);
        const vineY = vineRect.top - containerRect.top + (vineRect.height / 2);
        
        console.log('🫘 DEBUG: Starting continuous bean spawning around vine at', vineX, vineY);
        
        // Start initial burst of beans (8-12 beans immediately)
        const initialBeans = Math.floor(Math.random() * 5) + 8; // 8-12 initial beans
        const initialSpawnInterval = 600; // 600ms between initial beans
        
        for (let i = 0; i < initialBeans; i++) {
            setTimeout(() => {
                this.spawnSingleBeanRandomly(potIndex, beanImage, vineX, vineY, plantData.beanSpawnIndex++, plantName);
            }, i * initialSpawnInterval + Math.random() * 200);
        }
        
        // Start continuous spawning system to maintain 20 beans max
        this.startContinuousSpawning(potIndex, beanImage, vineX, vineY, plantName);
        
        console.log(`🫘 DEBUG: Started initial batch of ${initialBeans} beans + continuous spawning system`);
    }

    // Start continuous spawning system to maintain max beans
    startContinuousSpawning(potIndex, beanImage, vineX, vineY, plantName) {
        const plantData = this.growingPlants.get(potIndex);
        if (!plantData) return;
        
        // Store spawning info for continuous use
        plantData.continuousSpawning = {
            beanImage: beanImage,
            vineX: vineX,
            vineY: vineY,
            plantName: plantName,
            intervalId: null
        };
        
        // FAST CHECK INTERVAL: Check every 1-2 seconds regardless of plant rarity
        // The rarity/level affects value, not spawn frequency
        const checkInterval = 1000 + Math.random() * 1000; // 1-2 seconds randomly
        
        plantData.continuousSpawning.intervalId = setInterval(() => {
            this.checkAndSpawnBeans(potIndex);
        }, checkInterval);
        
        this.growingPlants.set(potIndex, plantData);
        console.log(`🔄 DEBUG: Started continuous spawning for pot ${potIndex} (checking every ${(checkInterval/1000).toFixed(1)}s for fast bean replenishment)`);
    }

    // Check current bean count and spawn more if needed
    checkAndSpawnBeans(potIndex) {
        const plantData = this.growingPlants.get(potIndex);
        if (!plantData || !plantData.continuousSpawning) return;
        
        // More robust check: verify vine element exists in DOM and plant is ready/growing
        const vineElement = plantData.vineElement;
        const potState = this.pots[potIndex]?.state;
        
        // If vine element doesn't exist or pot is empty/harvested, stop spawning
        if (!vineElement || !vineElement.parentNode || potState === 'empty' || potState === 'harvested') {
            console.log('🔄 DEBUG: Stopping continuous spawning - vine removed or harvested');
            this.stopContinuousSpawning(potIndex);
            return;
        }
        
        // Continue spawning if pot is ready OR growing (more flexible than just 'ready')
        if (potState !== 'ready' && potState !== 'growing') {
            console.log(`🔄 DEBUG: Skipping spawn check - pot state is: ${potState}`);
            return; // Skip this check but don't stop spawning entirely
        }
        
        // Check if we're in cooldown period after collecting beans
        const now = Date.now();
        if (plantData.lastBeanCollectTime && (now - plantData.lastBeanCollectTime) < 500) {
            // Very short cooldown (0.5s) for responsive spawning
            return;
        }
        
        // Count current beans around this vine
        const currentBeans = document.querySelectorAll(`[data-pot-index="${potIndex}"].vine-bean:not(.flying-to-money)`);
        const currentCount = currentBeans.length;
        const maxBeans = 20;
        
        if (currentCount < maxBeans) {
            // URGENT SPAWNING: Spawn faster when bean count is low
            const beansToSpawn = currentCount === 0 ? 
                Math.min(3, maxBeans - currentCount) : // Spawn 3 beans immediately if none exist
                Math.min(2, maxBeans - currentCount);   // Otherwise spawn 2 at a time
            
            const spawning = plantData.continuousSpawning;
            
            console.log(`🌱 DEBUG: Pot ${potIndex} has ${currentCount}/${maxBeans} beans - spawning ${beansToSpawn} more urgently`);
            
            // Spawn the needed beans with shorter delays
            for (let i = 0; i < beansToSpawn; i++) {
                setTimeout(() => {
                    plantData.beanSpawnIndex = (plantData.beanSpawnIndex || 0) + 1;
                    this.spawnSingleBeanRandomly(
                        potIndex, 
                        spawning.beanImage, 
                        spawning.vineX, 
                        spawning.vineY, 
                        plantData.beanSpawnIndex, 
                        spawning.plantName
                    );
                }, i * 200); // Only 200ms between rapid spawns (much faster!)
            }
        }
    }

    // Stop continuous spawning (when harvesting)
    stopContinuousSpawning(potIndex) {
        const plantData = this.growingPlants.get(potIndex);
        if (plantData?.continuousSpawning?.intervalId) {
            clearInterval(plantData.continuousSpawning.intervalId);
            plantData.continuousSpawning = null;
            this.growingPlants.set(potIndex, plantData);
            console.log(`🛑 DEBUG: Stopped continuous spawning for pot ${potIndex}`);
        }
    }

    // Spawn a single bean at a random position alongside the vine
    spawnSingleBeanRandomly(potIndex, beanImage, vineX, vineY, beanIndex, plantName) {
        const plantData = this.growingPlants.get(potIndex);
        if (!plantData) {
            return; // Stop spawning if plant is gone
        }
        
        // Check current bean count via DOM (more reliable than tracking)
        const currentBeans = document.querySelectorAll(`[data-pot-index="${potIndex}"].vine-bean:not(.flying-to-money)`);
        if (currentBeans.length >= 20) {
            console.log('🫘 DEBUG: Max beans reached for pot', potIndex, '- skipping spawn');
            return; // Already at max beans
        }
        
        const potsContainer = document.getElementById('potsContainer');
        if (!potsContainer) return;
        
        // Position beans closer to the middle of the vine, shifted slightly left
        const side = Math.random() < 0.5 ? -1 : 1; // -1 = left side, 1 = right side
        const sideDistance = 15 + Math.random() * 25; // Distance 15-40px from vine center (closer!)
        const randomX = (side * sideDistance) - 12; // Left or right of vine, with tiny bit more left shift (-12px)
        
        // Position along the vine height, shifted slightly up
        const vineHeight = 340; // Slightly reduced vine height (was 350)
        const randomY = Math.random() * vineHeight - (vineHeight * 0.4) - 10; // Shifted up by 25px (from +15 to -10)
        
        // Random rotation for orientation - this MUST be preserved!
        const randomRotation = Math.random() * 360; // 0-360° rotation
        const randomScale = 0.8 + Math.random() * 0.4; // Random size 0.8x-1.2x
        
        // Random animation delay
        const randomDelay = Math.random() * 1.5; // 0-1.5s delay
        
        // Generate bean rarity with level-based enhancement
        // Base chances: 1.5% shiny, 1.5% golden, enhanced by plant level
        let specialChanceMultiplier = 1.0;
        if (this.pots && this.pots[potIndex] && this.pots[potIndex].multipliers) {
            specialChanceMultiplier = this.pots[potIndex].multipliers.special_chance;
        } else if (this.pots && this.pots[potIndex] && this.pots[potIndex].level) {
            // Fallback calculation: 1.0x at level 1, 3.0x at level 25
            const level = this.pots[potIndex].level;
            specialChanceMultiplier = 1.0 + (level - 1) * 2.0 / 24;
        }
        
        const baseShinyChance = 0.015; // 1.5% base
        const baseGoldenChance = 0.015; // 1.5% base
        const enhancedShinyChance = baseShinyChance * specialChanceMultiplier;
        const enhancedGoldenChance = baseGoldenChance * specialChanceMultiplier;
        
        const rarityRoll = Math.random();
        let beanRarity = 'none';
        if (rarityRoll < enhancedShinyChance) {
            beanRarity = 'shiny'; // Silver shiny - enhanced chance, 200% more valuable
        } else if (rarityRoll < enhancedShinyChance + enhancedGoldenChance) {
            beanRarity = 'golden'; // Golden - enhanced chance, 500% more valuable  
        }
        
        // Generate bean size with level-based enhancement
        // Base chances: 2% big, 0.5% massive, enhanced by plant level
        const baseMassiveChance = 0.005; // 0.5% base
        const baseBigChance = 0.020; // 2% base
        const enhancedMassiveChance = baseMassiveChance * specialChanceMultiplier;
        const enhancedBigChance = baseBigChance * specialChanceMultiplier;
        
        const sizeRoll = Math.random();
        let beanSize = 'normal';
        if (sizeRoll < enhancedMassiveChance) {
            beanSize = 'massive'; // Massive - enhanced chance, 500% more valuable
        } else if (sizeRoll < enhancedMassiveChance + enhancedBigChance) {
            beanSize = 'big'; // Big - enhanced chance, 200% more valuable
        }
        
        // Create bean element
        const bean = document.createElement('div');
        let className = 'vine-bean';
        if (beanRarity !== 'none') className += ` rarity-${beanRarity}`;
        if (beanSize !== 'normal') className += ` size-${beanSize}`;
        bean.className = className;
        bean.style.backgroundImage = `url('${beanImage}')`;
        bean.style.left = (vineX + randomX) + 'px';
        bean.style.top = (vineY + randomY) + 'px';
        bean.style.animationDelay = randomDelay + 's';
        bean.dataset.potIndex = potIndex;
        bean.dataset.beanIndex = beanIndex;
        bean.dataset.plantName = plantName; // Store plant name for value calculation
        bean.dataset.rarity = beanRarity; // Store rarity for value calculation
        bean.dataset.size = beanSize; // Store size for value calculation
        
        // Store the final transform values as CSS variables for the animation
        bean.style.setProperty('--final-scale', randomScale);
        bean.style.setProperty('--final-rotation', randomRotation + 'deg');
        
        // Add click event handler for amazing bean collection!
        bean.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.collectBean(bean, plantName);
        });
        
        // Bean starts invisible and small (CSS handles this via :not(.spawned))
        
        potsContainer.appendChild(bean);
        
        // Animate bean appearance after a brief delay
        setTimeout(() => {
            // Add spawned class which triggers the pulse animation and makes it visible
            bean.classList.add('spawned');
            // Set the final transform that will be used by the CSS animation
            bean.style.transform = `scale(${randomScale}) rotate(${randomRotation}deg)`;
        }, 50);
        
        console.log(`🫘 DEBUG: Spawned bean ${beanIndex} on ${side === -1 ? 'LEFT' : 'RIGHT'} side at (${Math.round(randomX)}, ${Math.round(randomY)}) with ${Math.round(randomRotation)}° rotation (${currentBeans.length + 1}/20)`);
    }

    // Clean up beans when harvesting
    removeBeansFromVine(potIndex) {
        // Stop continuous spawning first
        this.stopContinuousSpawning(potIndex);
        
        const beans = document.querySelectorAll(`[data-pot-index="${potIndex}"].vine-bean`);
        beans.forEach(bean => {
            bean.remove();
        });
        
        // Reset bean tracking state
        const plantData = this.growingPlants.get(potIndex);
        if (plantData) {
            plantData.isSpawningBeans = false;
            plantData.beanCount = 0;
            this.growingPlants.set(potIndex, plantData);
        }
        
        console.log('🫘 DEBUG: Removed', beans.length, 'beans from pot', potIndex, '+ stopped continuous spawning');
    }

    // AMAZING bean collection with flying animation!
    collectBean(beanElement, plantName) {
        if (beanElement.classList.contains('flying-to-money')) {
            return; // Already being collected
        }
        
        console.log('💰 DEBUG: Collecting bean from', plantName);
        console.log('🫘 DEBUG: Bean element:', beanElement);
        console.log('🫘 DEBUG: Bean dataset:', beanElement.dataset);
        
        // Get bean value with rarity and size multipliers
        const beanRarity = beanElement.dataset.rarity || 'none';
        const beanSize = beanElement.dataset.size || 'normal';
        const potIndex = parseInt(beanElement.dataset.potIndex);
        
        // Mark collection time to prevent instant respawn
        const plantData = this.growingPlants.get(potIndex);
        if (plantData) {
            plantData.lastBeanCollectTime = Date.now();
        }
        
        // Award experience to the plant (only when player manually clicks, not clippers)
        if (!beanElement.dataset.clipperCollected && this.pots && this.pots[potIndex] && this.pots[potIndex].instance_id) {
            const instanceId = this.pots[potIndex].instance_id;
            
            // ENSURE LEVEL BAR EXISTS when collecting beans!
            const levelBar = document.getElementById(`level-bar-${potIndex}`);
            if (!levelBar) {
                console.log('🚨 Level bar missing when collecting bean! Creating it!');
                const potData = this.pots[potIndex];
                this.createPlantLevelBar(
                    potIndex, 
                    potData.level || 1, 
                    potData.experience || 0, 
                    potData.required_xp || 100
                );
            }
            
            // Calculate XP based on bean attributes (better beans = more XP)
            let xpAmount = 2; // Base XP increased to 2
            if (beanRarity === 'golden') xpAmount = 10;  // Double rewards
            else if (beanRarity === 'shiny') xpAmount = 6;
            else if (beanSize === 'massive') xpAmount = 8;
            else if (beanSize === 'big') xpAmount = 4;
            
            // Award experience asynchronously (don't await to keep collection smooth)
            this.addPlantExperience(instanceId, xpAmount).then(result => {
                if (result && result.result) {
                    // Update level bar with animation
                    const potData = this.pots[potIndex];
                    if (potData) {
                        // Update pot data with new values from server
                        potData.level = result.result.new_level || potData.level;
                        potData.experience = result.result.experience || 0;
                        
                        // Update the level bar with pulse effect
                        this.updatePlantLevelBar(
                            potIndex, 
                            potData.level, 
                            potData.experience, 
                            potData.required_xp || 100, 
                            true
                        );
                        
                        // Add pulse effect to show XP gain
                        const levelBar = document.getElementById(`level-bar-${potIndex}`);
                        if (levelBar) {
                            levelBar.style.animation = 'none';
                            setTimeout(() => {
                                levelBar.style.animation = 'xp-pulse 0.5s ease';
                            }, 10);
                            
                            // Remove animation after it completes
                            setTimeout(() => {
                                levelBar.style.animation = '';
                            }, 510);
                        }
                    }
                }
            });
        }
        
        const beanValue = this.getBeanValueForPlant(plantName, beanRarity, beanSize, potIndex);
        
        // IMMEDIATE SATISFYING CLICK EFFECTS! ✨
        this.playClickEffects(beanElement);
        
        // Tutorial tracking
        this.onTutorialBeanCollected(beanRarity, beanSize);
        
        // Unlock this bean type in the collection index
        this.unlockBean(plantName);
        
        // Play special collection sound based on bean attributes (priority: golden > shiny > massive > big)
        if (beanRarity === 'golden') {
            this.playSound('goldcollect'); // Special golden bean sound
        } else if (beanRarity === 'shiny') {
            this.playSound('collectsilver'); // Special silver shiny bean sound
        } else if (beanSize === 'massive') {
            this.playSound('goldcollect'); // Massive beans use premium sound
        } else if (beanSize === 'big') {
            this.playSound('collectsilver'); // Big beans use enhanced sound
        } else {
            // Regular bean collection - alternate between two sounds for variety
            const beanSounds = ['collectbean', 'collectbean2'];
            const randomSound = beanSounds[Math.floor(Math.random() * beanSounds.length)];
            this.playSound(randomSound);
        }
        
        // Mark bean as flying to prevent multiple clicks
        beanElement.classList.add('flying-to-money');
        
        // Start the flying animation after click effect (300ms delay for satisfaction)
        setTimeout(() => {
            this.animateBeanToMoney(beanElement, beanValue);
        }, 300);
    }

    // Play immediate satisfying click effects
    playClickEffects(beanElement) {
        // Add satisfying pop animation to the bean
        beanElement.classList.add('clicked');
        
        // Create burst effect around the bean
        const beanRect = beanElement.getBoundingClientRect();
        const potsContainer = document.getElementById('potsContainer');
        
        const burst = document.createElement('div');
        burst.className = 'click-burst';
        burst.style.position = 'fixed';
        burst.style.left = (beanRect.left + beanRect.width/2 - 60) + 'px'; // Center the 120px burst
        burst.style.top = (beanRect.top + beanRect.height/2 - 60) + 'px';
        burst.style.zIndex = '99';
        
        document.body.appendChild(burst);
        
        // Remove burst after animation
        setTimeout(() => {
            burst.remove();
        }, 400);
        
        // Add screen shake effect for extra satisfaction
        this.addScreenShake();
        
        console.log('✨ DEBUG: Click effects triggered!');
    }

    // Add subtle screen shake for satisfying feedback
    addScreenShake() {
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.style.animation = 'screenShake 0.2s ease-in-out';
            
            setTimeout(() => {
                gameContainer.style.animation = '';
            }, 200);
        }
    }

    // Amazing flying animation from bean to money display
    animateBeanToMoney(beanElement, beanValue) {
        // Get current positions
        const beanRect = beanElement.getBoundingClientRect();
        const moneyElement = document.getElementById('moneyAmount');
        const moneyRect = moneyElement.getBoundingClientRect();
        
        // Calculate the flight path
        const startX = beanRect.left + beanRect.width / 2;
        const startY = beanRect.top + beanRect.height / 2;
        const endX = moneyRect.left + moneyRect.width / 2;
        const endY = moneyRect.top + moneyRect.height / 2;
        
        // Create a clone for the animation
        const flyingBean = beanElement.cloneNode(true);
        flyingBean.style.position = 'fixed';
        flyingBean.style.left = startX + 'px';
        flyingBean.style.top = startY + 'px';
        flyingBean.style.zIndex = '100';
        flyingBean.style.pointerEvents = 'none';
        flyingBean.classList.add('flying-to-money');
        flyingBean.style.width = '40px';
        flyingBean.style.height = '40px';
        
        document.body.appendChild(flyingBean);
        
        // REMOVE THE ORIGINAL BEAN IMMEDIATELY when flight starts!
        beanElement.remove();
        
        console.log(`✈️ DEBUG: Flying bean from (${Math.round(startX)}, ${Math.round(startY)}) to (${Math.round(endX)}, ${Math.round(endY)})`);
        
        // Calculate flight duration based on distance (longer for dramatic effect)
        const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        const duration = Math.min(Math.max(distance / 300, 1.2), 2.5); // 1.2-2.5 seconds (longer)
        
        // Apply the flying animation with calculated duration
        flyingBean.style.animation = `beanFlyToMoney ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
        
        // Create beautiful curved path animation
        this.animateAlongCurvedPath(flyingBean, startX, startY, endX, endY, duration);
        
        // Add money and effects when bean reaches destination
        setTimeout(() => {
            console.log('⏰ DEBUG: Bean collection timeout triggered!');
            
            // Add the money!
            this.addMoney(beanValue);
            
            // Get bean rarity and size from the flying bean element dataset
            const beanRarity = flyingBean.dataset.rarity || 'none';
            const beanSize = flyingBean.dataset.size || 'normal';
            console.log(`🫘 DEBUG: Bean rarity from dataset: ${beanRarity}`);
            console.log(`🫘 DEBUG: Bean size from dataset: ${beanSize}`);
            
            // Add XP based on bean rarity and size (10-20 XP range with decimals)
            let baseXP = Math.random() * 10 + 10; // Random 10.0 - 20.0
            console.log(`🎲 DEBUG: Base XP rolled: ${baseXP}`);
            
            // Apply rarity XP multipliers
            if (beanRarity === 'shiny') {
                baseXP *= 1.5; // Silver beans give 50% more XP
                console.log(`🥈 DEBUG: Silver bean multiplier applied: ${baseXP}`);
            } else if (beanRarity === 'golden') {
                baseXP *= 2.0; // Golden beans give 100% more XP
                console.log(`🥇 DEBUG: Golden bean multiplier applied: ${baseXP}`);
            }
            
            // Apply size XP multipliers (compound with rarity!)
            if (beanSize === 'big') {
                baseXP *= 1.5; // Big beans give 50% more XP
                console.log(`💪 DEBUG: Big bean size multiplier applied: ${baseXP}`);
            } else if (beanSize === 'massive') {
                baseXP *= 2.0; // Massive beans give 100% more XP
                console.log(`🚀 DEBUG: Massive bean size multiplier applied: ${baseXP}`);
            }
            const finalXP = Math.round(baseXP * 10) / 10; // Round to 1 decimal place
            
            const beanDescription = [beanSize !== 'normal' ? beanSize : '', beanRarity !== 'none' ? beanRarity : ''].filter(desc => desc).join(' ') || 'normal';
            console.log(`🫘 DEBUG: Bean collected! Value: $${beanValue}, Rarity: ${beanRarity}, Size: ${beanSize}, Final XP: ${finalXP}`);
            this.addXP(finalXP, `${beanDescription} bean`);
        
        // Show money burst effect
        this.showMoneyBurst(endX, endY, beanValue);
            
            // Remove the flying bean
            flyingBean.remove();
            
            console.log(`💰 DEBUG: Bean collected! Added $${beanValue.toLocaleString()}`);
            
            // Trigger immediate check for spawning replacement bean (after a short delay)
            const potIndex = parseInt(flyingBean.dataset.potIndex); // Use flyingBean since original is gone
            if (!isNaN(potIndex)) {
                setTimeout(() => {
                    this.checkAndSpawnBeans(potIndex);
                }, 500 + Math.random() * 1000); // 0.5-1.5 second delay
            }
            
        }, duration * 1000);
    }

    // Animate bean along a beautiful curved path across the screen
    animateAlongCurvedPath(beanElement, startX, startY, endX, endY, duration) {
        // Calculate control points for a dramatic arc
        const midX = (startX + endX) / 2;
        const midY = Math.min(startY, endY) - 150 - Math.random() * 50; // Higher arc (150-200px up)
        
        // Use requestAnimationFrame for smooth animation
        const startTime = performance.now();
        
        const animateStep = (currentTime) => {
            const elapsed = currentTime - startTime;
            let progress = Math.min(elapsed / (duration * 1000), 1);
            
            // Apply easing for more satisfying movement (ease-in-out-back)
            progress = progress < 0.5 
                ? 2 * progress * progress 
                : -1 + (4 - 2 * progress) * progress;
            
            // Quadratic Bézier curve calculation
            const t = progress;
            const x = Math.pow(1 - t, 2) * startX + 2 * (1 - t) * t * midX + Math.pow(t, 2) * endX;
            const y = Math.pow(1 - t, 2) * startY + 2 * (1 - t) * t * midY + Math.pow(t, 2) * endY;
            
            // Add slight wobble for more organic movement
            const wobbleX = 5 * Math.sin(progress * Math.PI * 8) * (1 - progress);
            const wobbleY = 3 * Math.cos(progress * Math.PI * 12) * (1 - progress);
            
            // Update position with wobble
            beanElement.style.left = (x + wobbleX) + 'px';
            beanElement.style.top = (y + wobbleY) + 'px';
            
            // Scale the bean slightly during flight for depth effect
            const scale = 1.2 + (0.3 * Math.sin(progress * Math.PI));
            beanElement.style.transform = `scale(${scale}) rotate(${progress * 720}deg)`;
            
            // Add subtle opacity pulsing
            beanElement.style.opacity = 0.95 + (0.05 * Math.sin(progress * Math.PI * 4));
            
            if (progress < 1) {
                requestAnimationFrame(animateStep);
            } else {
                // Ensure final position is exact
                beanElement.style.left = endX + 'px';
                beanElement.style.top = endY + 'px';
            }
        };
        
        requestAnimationFrame(animateStep);
    }

    // Add money to player's total
    addMoney(amount) {
        console.log(`💰 DEBUG: Adding ${amount} coins. Before: ${this.currentMoney}, After: ${this.currentMoney + amount}`);
        this.currentMoney += amount;
        this.updateMoneyDisplay();
        
        // Sync money to server after earning (debounced)
        this.debouncedSyncMoney();
        
        // Play coin sound effect
        this.playSound('coin');
    }

    // Sync money to server
    async syncMoneyToServer() {
        try {
            console.log('💰 DEBUG: Syncing money to server:', this.currentMoney);
            const response = await fetch('/api/update-money', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    coins: this.currentMoney
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('💰 DEBUG: Money synced successfully:', result);
            } else {
                console.error('❌ Failed to sync money to server:', response.status);
            }
        } catch (error) {
            console.error('❌ Error syncing money to server:', error);
        }
    }

    // Debounced money sync to avoid spamming the server
    debouncedSyncMoney() {
        clearTimeout(this.moneySyncTimeout);
        this.moneySyncTimeout = setTimeout(() => {
            this.syncMoneyToServer();
        }, 1000); // Sync money 1 second after last bean collection
    }

    // ===== LEVEL SYSTEM =====

    // Calculate XP requirement for a specific level
    calculateXPForLevel(level) {
        // 20% growth: level 1->2 = 1000 XP, level 2->3 = 1200 XP, level 3->4 = 1440 XP, etc.
        return Math.floor(this.baseXPRequirement * Math.pow(1.2, level - 2));
    }

    // Get total XP needed to reach a level (cumulative)
    getTotalXPForLevel(level) {
        let totalXP = 0;
        for (let i = 2; i <= level; i++) {
            totalXP += this.calculateXPForLevel(i);
        }
        return totalXP;
    }

    // Add XP and handle level ups
    addXP(amount, source = 'unknown') {
        console.log(`🔥 DEBUG: addXP called! Amount: ${amount}, Source: ${source}`);
        const oldLevel = this.currentLevel;
        this.currentXP = Math.round((this.currentXP + amount) * 10) / 10; // Round to 1 decimal place
        
        console.log(`📊 XP: +${amount} from ${source} (Total: ${this.currentXP})`);
        console.log(`📊 Current Level: ${this.currentLevel}, XP needed for next: ${this.getTotalXPForLevel(this.currentLevel + 1)}`);
        
        // Check for level up
        let newLevel = this.currentLevel;
        while (this.currentXP >= this.getTotalXPForLevel(newLevel + 1) && newLevel < 100) {
            newLevel++;
        }
        
        if (newLevel > oldLevel) {
            console.log(`🎉 LEVEL UP TRIGGERED! ${oldLevel} → ${newLevel}`);
            this.levelUp(oldLevel, newLevel);
        } else {
            console.log(`📊 Level bar updating... Level ${this.currentLevel}`);
            this.updateLevelBar();
        }
    }

    // Handle leveling up
    levelUp(oldLevel, newLevel) {
        this.currentLevel = newLevel;
        console.log(`🎉 LEVEL UP! ${oldLevel} → ${newLevel}`);
        
        // Play level up sound! 🎵
        this.playSound('levelup');
        
        // EPIC SCREEN SHAKE! 🌟
        this.triggerScreenShake();
        
        // INTENSE level bar animation
        const levelBarFill = document.getElementById('levelBarFill');
        if (levelBarFill) {
            levelBarFill.classList.add('level-up-epic');
            setTimeout(() => {
                levelBarFill.classList.remove('level-up-epic');
            }, 3000);
        }
        
        // SCREEN FLASH EFFECT! ⚡
        this.triggerScreenFlash();
        
        // Update the display
        this.updateLevelBar();
        
        // Check for fire unlock at level 3
        if (newLevel >= 3 && !this.fireUnlocked) {
            this.unlockLevel3Tools();
        }

        // Show EPIC notification
        this.showEpicLevelUpNotification(newLevel);
    }

    // Update the level bar display
    updateLevelBar() {
        const levelElement = document.getElementById('currentLevel');
        const xpElement = document.getElementById('currentXP');
        const nextLevelXPElement = document.getElementById('nextLevelXP');
        const levelBarFill = document.getElementById('levelBarFill');
        
        console.log(`📊 Updating level bar - Elements found:`, {
            levelElement: !!levelElement,
            xpElement: !!xpElement,
            nextLevelXPElement: !!nextLevelXPElement,
            levelBarFill: !!levelBarFill
        });
        
        if (!levelElement || !xpElement || !nextLevelXPElement || !levelBarFill) {
            console.error('❌ Some level bar elements not found!');
            return;
        }
        
        // Calculate current level progress
        const currentLevelStartXP = this.currentLevel > 1 ? this.getTotalXPForLevel(this.currentLevel) : 0;
        const nextLevelXP = this.getTotalXPForLevel(this.currentLevel + 1);
        const xpInCurrentLevel = this.currentXP - currentLevelStartXP;
        const xpNeededForNext = nextLevelXP - currentLevelStartXP;
        
        // Calculate percentage for progress bar
        const percentage = Math.min((xpInCurrentLevel / xpNeededForNext) * 100, 100);
        
        console.log(`📊 Level calculation:`, {
            currentLevel: this.currentLevel,
            totalXP: this.currentXP,
            currentLevelStartXP: currentLevelStartXP,
            nextLevelXP: nextLevelXP,
            xpInCurrentLevel: xpInCurrentLevel,
            xpNeededForNext: xpNeededForNext,
            percentage: percentage.toFixed(1) + '%'
        });
        
        // Update display with decimal places
        levelElement.textContent = this.currentLevel;
        xpElement.textContent = xpInCurrentLevel.toFixed(1); // Show 1 decimal place
        nextLevelXPElement.textContent = xpNeededForNext.toLocaleString(); // Format with commas
        levelBarFill.style.width = percentage + '%';
        
        console.log(`✅ Level bar updated! Level ${this.currentLevel}: ${xpInCurrentLevel.toFixed(1)}/${xpNeededForNext} XP (${percentage.toFixed(1)}%)`);
    }

    // EPIC SCREEN SHAKE EFFECT! 🌟
    triggerScreenShake() {
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.classList.add('epic-screen-shake');
            setTimeout(() => {
                gameContainer.classList.remove('epic-screen-shake');
            }, 2000);
        }
    }

    // INTENSE SCREEN FLASH EFFECT! ⚡
    triggerScreenFlash() {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: radial-gradient(circle, 
                rgba(255, 215, 0, 0.9) 0%, 
                rgba(255, 140, 0, 0.7) 30%, 
                rgba(255, 69, 0, 0.5) 60%, 
                transparent 100%);
            z-index: 9999;
            pointer-events: none;
            animation: epicFlash 2s ease-out forwards;
        `;
        document.body.appendChild(flash);

        // Multiple flash waves
        setTimeout(() => {
            const flash2 = flash.cloneNode();
            flash2.style.animation = 'epicFlash 1.5s ease-out forwards';
            flash2.style.background = `radial-gradient(circle, 
                rgba(0, 255, 255, 0.6) 0%, 
                rgba(255, 0, 255, 0.4) 50%, 
                transparent 100%)`;
            document.body.appendChild(flash2);
            setTimeout(() => flash2.remove(), 1500);
        }, 300);

        setTimeout(() => flash.remove(), 2000);
    }

    // PARTICLE EXPLOSION SYSTEM REMOVED - keeping only text

    // ===== FIRE BURN TOOL SYSTEM =====
    
    // Unlock level 3 tools (fire burn tool + bean collection)
    unlockLevel3Tools() {
        console.log('🔥🫘 Unlocking Level 3 tools!');
        this.fireUnlocked = true;
        this.beanCollectionUnlocked = true;
        
        const level3Tools = document.getElementById('level3Tools');
        if (level3Tools) {
            level3Tools.style.display = 'flex';
            
            // Setup fire tool drag functionality
            this.setupFireDragAndDrop();
            
            console.log('🔥🫘 Level 3 tools unlocked and visible!');
        }
    }

    // Legacy function name for compatibility
    unlockFireTool() {
        this.unlockLevel3Tools();
    }

    // Setup custom drag functionality for fire emoji (like inventory items)
    setupFireDragAndDrop() {
        const fireEmoji = document.getElementById('fireEmoji');
        if (!fireEmoji) return;

        let isDragging = false;

        // Mouse down - start drag
        fireEmoji.addEventListener('mousedown', (e) => {
            console.log('🔥 Fire drag started');
            isDragging = true;
            
            fireEmoji.classList.add('dragging');
            
            e.preventDefault();
        });

        // Mouse move - update drag position
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            // Position the fire emoji at cursor
            fireEmoji.style.position = 'fixed';
            fireEmoji.style.left = (e.clientX - 24) + 'px'; // Center on cursor (24px = half of 48px emoji)
            fireEmoji.style.top = (e.clientY - 24) + 'px';
            fireEmoji.style.zIndex = '1000';
            
            // Visual feedback - check for nearby vines (throttle to reduce spam)
            if (!this.lastVineCheck || Date.now() - this.lastVineCheck > 100) {
                this.lastVineCheck = Date.now();
                const vineResult = this.getClosestVine(e.clientX, e.clientY);
                if (vineResult && vineResult.distance <= 50) {
                    // Add visual feedback for nearby vine
                    console.log(`🔥 Near ${vineResult.plantName} (${vineResult.distance.toFixed(0)}px)`);
                    vineResult.vine.style.filter = 'brightness(1.2) drop-shadow(0 0 10px rgba(255, 100, 0, 0.8))';
                } else {
                    // Remove visual feedback from all vines
                    const gameContainer = document.getElementById('gameContainer');
                    const allVines = gameContainer.querySelectorAll('.vine, .plant-background');
                    allVines.forEach(vine => {
                        vine.style.filter = '';
                    });
                }
            }
        });

        // Mouse up - end drag
        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            
            console.log('🔥 Fire drag ended at position:', e.clientX, e.clientY);
            isDragging = false;
            fireEmoji.classList.remove('dragging');
            
            // Check if dropped near a vine
            const vineResult = this.getClosestVine(e.clientX, e.clientY);
            console.log('🔥 Vine result:', vineResult);
            
            if (vineResult) {
                this.handleFireDropOnVine(vineResult.potIndex, vineResult.plantName, vineResult.distance);
            } else {
                console.log('🔥 No vine found within range');
            }
            
            // Reset position and styling
            fireEmoji.style.position = '';
            fireEmoji.style.left = '';
            fireEmoji.style.top = '';
            fireEmoji.style.zIndex = '';
            
            // Clear visual feedback from all vines
            const gameContainer = document.getElementById('gameContainer');
            const allVines = gameContainer.querySelectorAll('.vine, .plant-background');
            allVines.forEach(vine => {
                vine.style.filter = '';
            });
        });
    }

    // Find closest vine to cursor position
    getClosestVine(x, y) {
        console.log(`🔥 Looking for closest vine to position: (${x}, ${y})`);
        
        let closestVine = null;
        let closestDistance = Infinity;
        const maxDistance = 100; // Maximum distance to consider "close"
        
        console.log(`🔥 Found ${this.growingPlants.size} growing plants to check`);
        
        // Iterate through the growingPlants Map instead of trying to find vines as pot children
        for (const [potIndex, plantData] of this.growingPlants.entries()) {
            if (!plantData.vineElement) {
                console.log(`🔥 Pot ${potIndex} has no vine element, skipping`);
                continue;
            }
            
            const vine = plantData.vineElement;
            console.log(`🔥 Found vine in pot ${potIndex}:`, vine.className);
            
            // Get vine center position
            const vineRect = vine.getBoundingClientRect();
            const vineCenterX = vineRect.left + vineRect.width / 2;
            const vineCenterY = vineRect.top + vineRect.height / 2;
            
            // Calculate distance from cursor to vine center
            const distance = Math.sqrt(
                Math.pow(x - vineCenterX, 2) + Math.pow(y - vineCenterY, 2)
            );
            
            console.log(`🔥 Pot ${potIndex}: vine center at (${vineCenterX.toFixed(0)}, ${vineCenterY.toFixed(0)}), distance: ${distance.toFixed(0)}px`);
            
            if (distance < closestDistance && distance <= maxDistance) {
                closestDistance = distance;
                
                // Get plant name from seed name or use fallback
                const plantName = plantData.seedName ? plantData.seedName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown Plant';
                
                closestVine = {
                    potIndex: potIndex,
                    plantName: plantName,
                    distance: distance,
                    vine: vine
                };
                
                console.log(`🔥 New closest vine found: ${plantName} at distance ${distance.toFixed(0)}px`);
            }
        }
        
        if (closestVine) {
            console.log(`🔥 Final result: ${closestVine.plantName} (pot ${closestVine.potIndex}) at ${closestVine.distance.toFixed(0)}px distance ✅`);
        } else {
            console.log(`🔥 No vine found within ${maxDistance}px range`);
        }
        
        return closestVine;
    }

    // Setup visual feedback for pot drop zones during fire drag
    setupPotDropZones() {
        // This is now handled in the mouse move/up events above
        console.log('🔥 Drop zones setup completed (custom drag system)');
    }

    // Handle fire drop on vine
    handleFireDropOnVine(potIndex, plantName, distance) {
        console.log(`🔥 Fire dropped near ${plantName} (${distance.toFixed(0)}px away)`);
        this.showBurnConfirmation(potIndex, plantName);
    }

    // Show burn confirmation modal
    showBurnConfirmation(potIndex, plantName) {
        // Store the pending burn data
        this.pendingBurn = {
            potIndex: potIndex,
            plantName: plantName
        };
        
        // Update modal content
        document.getElementById('burnItemName').textContent = plantName;
        
        // Show modal
        document.getElementById('burnModal').classList.add('active');
        document.getElementById('burnModalOverlay').classList.add('active');
        
        console.log(`🔥 Showing burn confirmation for ${plantName} in pot ${potIndex}`);
    }

    // Cancel burn action
    cancelBurn() {
        // Hide modal
        document.getElementById('burnModal').classList.remove('active');
        document.getElementById('burnModalOverlay').classList.remove('active');
        
        // Clear pending burn
        if (this.pendingBurn) {
            console.log(`❌ Burn cancelled for ${this.pendingBurn.plantName}`);
            this.pendingBurn = null;
        }
    }

    // Confirm burn action
    confirmBurn() {
        if (!this.pendingBurn) {
            console.error('❌ No pending burn to confirm');
            return;
        }
        
        console.log(`🔥 Confirmed burning ${this.pendingBurn.plantName} in pot ${this.pendingBurn.potIndex}`);
        this.burnPlant(this.pendingBurn.potIndex);
        
        // Hide modal and clear pending burn
        this.cancelBurn();
    }

    // Burn the plant (replace with burnt vine and animate)
    burnPlant(potIndex) {
        console.log(`🔥 Starting burn process for pot ${potIndex}`);
        
        // Get the vine element from the growingPlants Map
        const plantData = this.growingPlants.get(potIndex);
        if (!plantData || !plantData.vineElement) {
            console.log('❌ No growing plant found to burn for pot', potIndex);
            return;
        }

        const vine = plantData.vineElement;
        
        // Play burn sound effect
        this.playSound('burn');
        console.log('🔊 Playing burn sound effect');
        
        // Replace vine image with burnt version
        vine.style.backgroundImage = "url('Assets/burtvine.png')";
        vine.classList.add('burning');
        
        // Remove all beans from this pot
        this.removeBeansFromVine(potIndex);
        
        // Remove clipper if it exists
        this.removeClipper(potIndex);
        
        // Clear any existing transforms and animations so burn animation can take over
        vine.style.transform = 'translateX(-50%) scale(1, 1)'; // Start from full grown state
        vine.style.animation = '';
        vine.style.transformOrigin = 'bottom center'; // Make sure it shrinks into the pot
        vine.style.visibility = 'visible'; // Ensure vine stays visible during burn
        
        console.log('🔥 Vine setup for burn:', {
            transform: vine.style.transform,
            visibility: vine.style.visibility,
            className: vine.className
        });
        
        // Animate burn shrinking (reverse of growth)
        setTimeout(() => {
            console.log('🔥 Starting burn shrink animation - reversing growth');
            vine.style.animation = 'burnShrink 2s ease-in-out forwards';
            
            // ONLY remove after shrink animation completes
            setTimeout(() => {
                console.log('🔥 Shrink animation completed, now removing vine');
                this.completeBurn(potIndex);
            }, 2000); // Match exact animation duration
        }, 200);
    }

    // Complete the burn process and keep burnt remnant in pot
    completeBurn(potIndex) {
        console.log(`🔥 Completing burn for pot ${potIndex}`);
        
        const pot = document.querySelector(`.pot[data-pot-index="${potIndex}"]`);
        
        // Get vine element from growingPlants Map and keep it as burnt remnant
        const plantData = this.growingPlants.get(potIndex);
        if (plantData && plantData.vineElement) {
            // Don't remove the vine - keep it as a burnt stub in the pot
            const vine = plantData.vineElement;
            vine.classList.add('burnt-remnant');
            vine.classList.remove('growing', 'ready', 'grown', 'burning');
            
            // Ensure it stays in the shrunken state (in case animation doesn't stick)
            vine.style.transform = 'translateX(-50%) scale(0.3, 0)';
            vine.style.filter = 'brightness(0.6) sepia(1) hue-rotate(35deg)';
            vine.style.opacity = '0.8';
            
            console.log('🔥 Vine kept as burnt remnant in pot');
        }
        
        // Remove any seeds that might be in the pot (these should be direct children)
        const seeds = pot?.querySelector('.seeds');
        if (seeds) seeds.remove();
        
        // Update pot state to burnt (not empty)
        pot.classList.remove('planted', 'growing', 'ready');
        pot.classList.add('burnt');
        
        // Keep plant data but mark it as burnt
        if (plantData) {
            plantData.state = 'burnt';
            plantData.burntAt = Date.now();
        }
        
        // Update pot data attribute
        pot.dataset.state = 'burnt';
        
        // IMMEDIATELY update local pot state to allow replanting
        if (this.pots[potIndex]) {
            this.pots[potIndex].state = 'empty';  // Allow immediate replanting
            this.pots[potIndex].data = { state: 'empty' };
            console.log(`🔥 DEBUG: Local pot state updated to empty for pot ${potIndex}`);
        }
        
        // Sync with backend - clear the plant from the server
        this.syncBurnWithBackend(potIndex);
        
        console.log(`✅ Pot ${potIndex} now contains burnt plant remnant (can be replanted over)`);
    }

    // Sync burn action with backend
    async syncBurnWithBackend(potIndex) {
        try {
            console.log(`🔥 DEBUG: Syncing burn with backend for pot ${potIndex}`);
            
            const response = await fetch('/api/burn-plant', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pot_index: potIndex
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ DEBUG: Backend burn sync successful for pot ${potIndex}`);
                // Local state was already updated in completeBurn()
            } else {
                console.error(`❌ DEBUG: Backend burn sync failed for pot ${potIndex}:`, result.message);
            }
        } catch (error) {
            console.error(`❌ DEBUG: Error syncing burn with backend for pot ${potIndex}:`, error);
        }
    }

    // Show EPIC level up notification
    showEpicLevelUpNotification(newLevel) {
        // Clean text notification without box
        const notification = document.createElement('div');
        notification.className = 'epic-level-up-notification';
        notification.innerHTML = `
            <div class="epic-level-up-text">LEVEL UP!</div>
            <div class="epic-level-up-number">LEVEL ${newLevel}</div>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-weight: bold;
            text-align: center;
            z-index: 10000;
            animation: cleanLevelUpAnimation 4s ease-out forwards;
            pointer-events: none;
            text-shadow: 
                0 0 20px rgba(255, 215, 0, 1),
                0 0 40px rgba(255, 215, 0, 0.8),
                0 0 60px rgba(255, 215, 0, 0.6);
        `;

        // Add epic animation styles
        this.addEpicAnimationStyles();
        
        document.body.appendChild(notification);
        
        // Remove notification after animation
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4000);
    }

    // Add all epic animation keyframes
    addEpicAnimationStyles() {
        if (!document.querySelector('style[data-epic-level-up]')) {
            const style = document.createElement('style');
            style.setAttribute('data-epic-level-up', 'true');
            style.textContent = `
                @keyframes cleanLevelUpAnimation {
                    0% { 
                        transform: translate(-50%, -50%) scale(0);
                        opacity: 0;
                    }
                    15% {
                        transform: translate(-50%, -50%) scale(1.5);
                        opacity: 1;
                    }
                    30% {
                        transform: translate(-50%, -50%) scale(1.2);
                    }
                    45% {
                        transform: translate(-50%, -50%) scale(1.3);
                    }
                    75% {
                        transform: translate(-50%, -50%) scale(1);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(-50%, -200%) scale(0.7);
                        opacity: 0;
                    }
                }

                @keyframes epicFlash {
                    0% { opacity: 0; }
                    20% { opacity: 1; }
                    100% { opacity: 0; }
                }

                /* Particle animation removed */

                @keyframes epicScreenShake {
                    0%, 100% { transform: translateX(0); }
                    10% { transform: translateX(-10px) translateY(5px); }
                    20% { transform: translateX(10px) translateY(-5px); }
                    30% { transform: translateX(-8px) translateY(8px); }
                    40% { transform: translateX(8px) translateY(-8px); }
                    50% { transform: translateX(-6px) translateY(3px); }
                    60% { transform: translateX(6px) translateY(-3px); }
                    70% { transform: translateX(-4px) translateY(4px); }
                    80% { transform: translateX(4px) translateY(-4px); }
                    90% { transform: translateX(-2px) translateY(2px); }
                }

                .level-bar-fill.level-up-epic {
                    animation: epicLevelBarPulse 3s ease-in-out;
                }

                @keyframes epicLevelBarPulse {
                    0%, 100% {
                        background: linear-gradient(90deg, #4CAF50, #8BC34A);
                        box-shadow: 0 0 20px rgba(76, 175, 80, 0.6);
                    }
                    25% {
                        background: linear-gradient(90deg, #FFD700, #FFC107);
                        box-shadow: 0 0 40px rgba(255, 215, 0, 0.8);
                        transform: scaleY(1.3);
                    }
                    50% {
                        background: linear-gradient(90deg, #FF5722, #FF9800);
                        box-shadow: 0 0 60px rgba(255, 87, 34, 1);
                        transform: scaleY(1.5);
                    }
                    75% {
                        background: linear-gradient(90deg, #E91E63, #9C27B0);
                        box-shadow: 0 0 80px rgba(233, 30, 99, 1);
                        transform: scaleY(1.2);
                    }
                }

                .epic-screen-shake {
                    animation: epicScreenShake 2s linear;
                }

                .epic-level-up-text { 
                    font-size: 32px; 
                    margin-bottom: 10px; 
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
                    animation: textGlow 1s ease-in-out infinite alternate;
                }
                
                .epic-level-up-number { 
                    font-size: 48px; 
                    font-weight: 900;
                    margin-bottom: 10px;
                    text-shadow: 3px 3px 6px rgba(0,0,0,0.7);
                    animation: numberPulse 1.5s ease-in-out infinite;
                }

                @keyframes textGlow {
                    from { 
                        text-shadow: 
                            0 0 20px rgba(255, 215, 0, 1),
                            0 0 40px rgba(255, 215, 0, 0.8),
                            0 0 60px rgba(255, 215, 0, 0.6); 
                    }
                    to { 
                        text-shadow: 
                            0 0 30px rgba(255, 215, 0, 1),
                            0 0 50px rgba(255, 215, 0, 1),
                            0 0 80px rgba(255, 215, 0, 0.8); 
                    }
                }

                @keyframes numberPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Initialize level bar on game start
    initializeLevelBar() {
        console.log('📊 Initializing level system...');
        console.log(`📊 Starting level: ${this.currentLevel}, XP: ${this.currentXP.toFixed(1)}, Base requirement: ${this.baseXPRequirement}`);
        
        // Make sure level bar is visible
        const levelBarContainer = document.getElementById('levelBarContainer');
        if (levelBarContainer) {
            levelBarContainer.style.display = 'block';
            console.log('📊 Level bar container found and made visible');
        } else {
            console.error('❌ Level bar container not found!');
        }
        
        // Only initialize XP to 0.0 if it hasn't been set yet (preserve existing XP)
        if (typeof this.currentXP === 'undefined' || this.currentXP === null) {
            this.currentXP = 0.0;
            console.log('📊 XP initialized to 0.0');
        } else {
            console.log(`📊 XP preserved at ${this.currentXP.toFixed(1)}`);
        }
        
        // Fire tool will be unlocked automatically when reaching level 3
        // (removed testing code that always unlocked it)
        
        this.updateLevelBar();
        console.log('📊 Level system initialized successfully');
        console.log(`📊 XP needed for level 2: ${this.getTotalXPForLevel(2)}`);
        console.log(`📊 XP needed for level 3: ${this.getTotalXPForLevel(3)}`);
    }

    // ===== AUDIO SYSTEM =====
    
    initializeAudioSystem() {
        console.log('🎵 Initializing enhanced audio system...');
        
        // Preload background music tracks (only 2 now, loop between them)
        this.backgroundTracks = [
            new Audio('Sound/backgroundmusic1.mp3'),
            new Audio('Sound/backgroundmusic2.mp3')
        ];
        
        // Configure background music tracks for seamless rotation
        this.currentTrackIndex = 0;
        this.backgroundTracks.forEach((track, index) => {
            track.volume = 0.4; // Background music quieter
            track.preload = 'auto';
            track.addEventListener('ended', () => this.playNextBackgroundTrack());
        });
        
        this.backgroundMusic = this.backgroundTracks[0]; // Current playing track
        
        // Preload all sound effects including new ones
        this.sounds = {
            coin: new Audio('Sound/coin.mp3'),
            collectbean: new Audio('Sound/collectbean.mp3'),
            collectbean2: new Audio('Sound/collectbean2.mp3'),
            collectsilver: new Audio('Sound/collectsilver.mp3'),
            goldcollect: new Audio('Sound/goldcollect.mp3'),
            purchase: new Audio('Sound/purchase.mp3'),
            levelup: new Audio('Sound/levelup.mp3'),
            burn: new Audio('Sound/burn.mp3'),
            swoosh: new Audio('Sound/swoosh.mp3'),
            notification: new Audio('Sound/notification.mp3'),
            plant: new Audio('Sound/plant.mp3')
        };
        
        // Set volume for all sounds
        Object.values(this.sounds).forEach(sound => {
            sound.volume = this.volume;
            sound.preload = 'auto';
        });
        
        console.log('🎵 Enhanced audio system initialized with 3 background tracks and special effects!');
    }

    startBackgroundMusic() {
        if (this.backgroundMusic) {
            // Start with track 1, will rotate automatically
            this.currentTrackIndex = 0;
            this.backgroundMusic = this.backgroundTracks[this.currentTrackIndex];
            
            // Try to play immediately, but handle autoplay restrictions
            this.backgroundMusic.play().then(() => {
                console.log('🎵 Background music started successfully - Track ' + (this.currentTrackIndex + 1));
            }).catch(error => {
                console.log('🎵 Background music autoplay blocked - will start on first user interaction');
                // Add a one-time click listener to start music on first interaction
                const startMusicOnClick = () => {
                    this.backgroundMusic.play().then(() => {
                        console.log('🎵 Background music started after user interaction - Track ' + (this.currentTrackIndex + 1));
                    });
                    document.removeEventListener('click', startMusicOnClick);
                };
                document.addEventListener('click', startMusicOnClick);
            });
        }
    }
    
    playNextBackgroundTrack() {
        // Rotate to next track
        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.backgroundTracks.length;
        this.backgroundMusic = this.backgroundTracks[this.currentTrackIndex];
        
        // Play the next track
        this.backgroundMusic.play().then(() => {
            console.log('🎵 Switched to background music track ' + (this.currentTrackIndex + 1));
        }).catch(error => {
            console.log('🎵 Failed to switch background track:', error);
        });
    }

    playSound(soundName) {
        const sound = this.sounds[soundName];
        if (sound) {
            // Create a clone for overlapping sounds
            const soundClone = sound.cloneNode();
            soundClone.volume = this.volume;
            soundClone.play().catch(error => {
                console.log(`🔊 Failed to play sound: ${soundName}`, error);
            });
        }
    }

    // ===== BEAN COLLECTION INDEX SYSTEM =====
    
    initializeBeanIndex() {
        console.log('🫘 Initializing bean collection system');
        
        const beanButton = document.getElementById('beanCollectionButton');
        const beanModal = document.getElementById('beanCollectionModal');
        const beanGrid = document.getElementById('beanGrid');
        const beanModalClose = document.getElementById('beanModalClose');
        
        if (!beanButton || !beanModal || !beanGrid || !beanModalClose) {
            console.error('❌ Bean collection elements not found!');
            return;
        }
        
        // Don't show the button yet - it unlocks at level 3
        
        // Clear existing grid
        beanGrid.innerHTML = '';
        
        // Create slots for all bean types
        this.allBeanTypes.forEach((beanType, index) => {
            const slot = document.createElement('div');
            slot.className = 'bean-slot locked';
            slot.dataset.beanName = beanType.name;
            
            // Show locked state initially
            slot.innerHTML = `
                <img class="bean-slot-image" src="${beanType.image}" alt="${beanType.name}" />
                <div class="bean-slot-name">???</div>
            `;
            
            beanGrid.appendChild(slot);
        });
        
        // Setup modal event listeners
        beanButton.addEventListener('click', () => {
            this.playSound('swoosh');
            beanModal.classList.add('active');
            this.updateBeanCollectionCount();
        });
        
        beanModalClose.addEventListener('click', () => {
            this.playSound('swoosh');
            beanModal.classList.remove('active');
        });
        
        // Close modal when clicking outside
        beanModal.addEventListener('click', (e) => {
            if (e.target === beanModal) {
                this.playSound('swoosh');
                beanModal.classList.remove('active');
            }
        });
        
        console.log('🫘 Bean collection system initialized with', this.allBeanTypes.length, 'beans');
    }
    
    updateBeanCollectionCount() {
        const countElement = document.getElementById('beanCollectionCount');
        if (countElement) {
            countElement.textContent = `(${this.beanCollection.size}/${this.allBeanTypes.length})`;
        }
    }
    
    unlockBean(plantName) {
        if (!this.beanCollection.has(plantName)) {
            this.beanCollection.add(plantName);
            console.log('🆕 Bean unlocked:', plantName);
            
            // Find the matching bean type
            const beanType = this.allBeanTypes.find(bean => bean.name === plantName);
            if (beanType) {
                // Update the visual slot
                const slot = document.querySelector(`[data-bean-name="${plantName}"]`);
                if (slot) {
                    slot.className = 'bean-slot unlocked';
                    slot.innerHTML = `
                        <img class="bean-slot-image" src="${beanType.image}" alt="${beanType.name}" />
                        <div class="bean-slot-name">${beanType.name}</div>
                    `;
                    
                    // Add unlock animation
                    slot.style.animation = 'beanUnlock 1.2s ease-out';
                    setTimeout(() => {
                        slot.style.animation = '';
                    }, 1200);
                }
                
                // Play unlock sound
                this.playSound('coin'); // Use coin sound for bean unlock
                
                // Update collection count
                this.updateBeanCollectionCount();
                
                console.log(`✨ Bean unlocked: ${plantName} (${this.beanCollection.size}/${this.allBeanTypes.length})`);
            }
        }
    }

    // ===== TUTORIAL SYSTEM =====
    
    getTutorialSteps() {
        return [
            {
                title: "🌱 Welcome to Grow a Beanstalk!",
                icon: "📖",
                text: "Let's learn how to grow your first beanstalk! Click anywhere to start your gardening journey.",
                checkComplete: () => true // Always complete immediately
            },
            {
                title: "🎒 Open Your Inventory",
                icon: "🎒",
                text: "First, open your inventory by clicking the inventory button at the bottom of the screen. You should see your first seed waiting for you!",
                checkComplete: () => this.tutorialData.inventoryOpened
            },
            {
                title: "🌱 Plant Your First Seed",
                icon: "🪴",
                text: "Great! Now drag your seed from the inventory and drop it on any empty pot to plant it. Watch as your beanstalk starts to grow!",
                checkComplete: () => this.tutorialData.plantsPlanted >= 1
            },
            {
                title: "⏳ Wait & Harvest Beans",
                icon: "🫘",
                text: "Perfect! Your plant is growing. Wait for it to mature, then collect 25 beans by clicking on them. Each bean gives you money!",
                checkComplete: () => this.tutorialData.beansCollected >= 25
            },
            {
                title: "🏪 Buy Your Next Seed",
                icon: "🛒",
                text: "Excellent work! Now use your earnings to buy a new seed from the shop. Open the shop and purchase any seed you can afford!",
                checkComplete: () => this.tutorialData.seedsPurchased >= 1
            },
                            {
            title: "✨ Collect Silver Beans",
            icon: "🥈",
            text: "Amazing! Now find and collect 3 silver beans (shiny variants). These are more valuable and appear randomly!",
            checkComplete: () => this.tutorialData.silverBeansCollected >= 3
        },
        {
            title: "🏆 Collect Golden Beans",
            icon: "🥇",
            text: "Incredible progress! Now find and collect 3 golden beans (the rarest variants). These are extremely valuable!",
            checkComplete: () => this.tutorialData.goldBeansCollected >= 3
            }
        ];
    }
    
    startTutorial() {
        console.log('🎓 DEBUG: Starting tutorial every time game starts...');
        this.tutorialActive = true;
        this.tutorialStep = 0;
        
        // Reset tutorial data
        this.tutorialData = {
            beansCollected: 0,
            seedsPurchased: 0,
            plantsPlanted: 0,
            inventoryOpened: false,
            silverBeansCollected: 0,
            goldBeansCollected: 0
        };
        
        // Add a small delay to ensure DOM elements are ready
        setTimeout(() => {
        this.showTutorialStep();
        this.setupTutorialEventListeners();
        this.showTutorialObjective();
            console.log('🎓 Tutorial started! Should be visible now.');
        }, 100);
    }
    
    setupTutorialEventListeners() {
        // No event listeners needed since we're only using the top-left objective box
        // Tutorial progresses automatically when tasks are completed
    }
    
    showTutorialStep() {
        const steps = this.getTutorialSteps();
        const currentStep = steps[this.tutorialStep];
        
        if (!currentStep) {
            this.completeTutorial();
            return;
        }
        
        // Don't show the modal overlay - only use the top-left objective box
        // The tutorial will guide through the top-left box only
        
        // Update the objective text immediately
        this.updateTutorialObjectiveText();
        
        // Check if step can be completed immediately (like welcome step)
        if (currentStep.checkComplete()) {
            // Auto-advance after 2 seconds for steps that are immediately complete
            setTimeout(() => {
                if (this.tutorialActive && this.tutorialStep < steps.length - 1) {
                    this.nextTutorialStep();
        } else {
                    this.completeTutorial();
                }
            }, 2000);
        } else {
            // Start checking for completion
            this.checkTutorialStepCompletion();
        }
    }
    
    hideTutorial() {
        // No modal to hide since we only use the top-left objective box
        // This function is kept for compatibility but does nothing now
    }
    
    nextTutorialStep() {
        this.tutorialStep++;
        this.showTutorialStep();
        this.updateTutorialObjectiveText(); // Update objective text when step advances
    }
    
    checkTutorialStepCompletion() {
        if (!this.tutorialActive) return;
        
        const steps = this.getTutorialSteps();
        const currentStep = steps[this.tutorialStep];
        
        if (currentStep && currentStep.checkComplete()) {
            // Step completed! Show next button or auto-advance
            document.getElementById('tutorialNext').style.display = 'inline-block';
            
            // Auto-advance after 2 seconds for better UX
            setTimeout(() => {
                if (this.tutorialActive && this.tutorialStep < steps.length - 1) {
                    this.nextTutorialStep();
                } else {
                    this.completeTutorial();
                }
            }, 2000);
        } else {
            // Keep checking every second
            setTimeout(() => this.checkTutorialStepCompletion(), 1000);
        }
    }
    
    skipTutorial() {
        console.log('🎓 Tutorial cannot be skipped - this functionality has been disabled');
        // Tutorial skip functionality has been disabled
        return false;
    }
    
    completeTutorial() {
        this.tutorialActive = false;
        
        // Show completion message in tutorial UI
        this.showTutorialCompletionMessage();
        
        console.log('🎓 Tutorial completed!');
    }

    showTutorialCompletionMessage() {
        const objective = document.getElementById('tutorialObjective');
        const objectiveTextElement = document.getElementById('tutorialObjectiveText');
        const objectiveIconElement = document.getElementById('tutorialObjectiveIcon');
        const progressContainer = document.getElementById('tutorialProgressContainer');

        if (objective && objectiveTextElement && objectiveIconElement) {
            // Hide progress bar for completion message
            progressContainer.style.display = 'none';
            
            // Update content for completion message
            objectiveIconElement.textContent = '🎉';
            objectiveTextElement.innerHTML = `
                <div class="tutorial-completion-message">
                    <div class="tutorial-completion-title">Tutorial Complete!</div>
                    <div class="tutorial-completion-content">
                        Reach 100 Million as fast as you can.
                    </div>
                    <button class="tutorial-dismiss-btn" onclick="gameManager.dismissTutorialCompletion()">
                        ✅ Got it!
                    </button>
                </div>
            `;
            
            // Add special styling for completion message
            objective.classList.add('tutorial-completed');
            
            // Show the tutorial objective with completion message
            this.showTutorialObjective();
        }
    }

    dismissTutorialCompletion() {
        const objective = document.getElementById('tutorialObjective');
        if (objective) {
            objective.classList.remove('tutorial-completed');
            this.hideTutorialObjective();
        }
    }
    
    // Tutorial event tracking methods
    onTutorialInventoryOpened() {
        if (this.tutorialActive) {
            this.tutorialData.inventoryOpened = true;
            console.log('🎓 Tutorial: Inventory opened!');
            this.updateTutorialObjectiveText(); // Update progress bar
        }
    }
    
    onTutorialPlantPlanted() {
        if (this.tutorialActive) {
            this.tutorialData.plantsPlanted++;
            console.log('🎓 Tutorial: Plant planted! Total:', this.tutorialData.plantsPlanted);
            this.updateTutorialObjectiveText(); // Update progress bar
        }
    }
    
    onTutorialBeanCollected(beanRarity = 'none', beanSize = 'normal') {
        if (this.tutorialActive) {
            // Always count regular beans
            this.tutorialData.beansCollected++;
            console.log('🎓 Tutorial: Bean collected! Total:', this.tutorialData.beansCollected);
            
            // Count special beans separately
            if (beanRarity === 'shiny') {
                this.tutorialData.silverBeansCollected++;
                console.log('🥈 Tutorial: Silver bean collected! Total:', this.tutorialData.silverBeansCollected);
            } else if (beanRarity === 'golden') {
                this.tutorialData.goldBeansCollected++;
                console.log('🥇 Tutorial: Golden bean collected! Total:', this.tutorialData.goldBeansCollected);
            }
            
            // Log size information for future tutorial expansion
            if (beanSize === 'big') {
                console.log('💪 Tutorial: Big bean collected!');
            } else if (beanSize === 'massive') {
                console.log('🚀 Tutorial: Massive bean collected!');
            }
            
            this.updateTutorialObjectiveText(); // Update objective and progress bar
            
            // Add a slight delay to make the progress bar animation more noticeable
            setTimeout(() => {
                this.updateTutorialObjectiveText();
            }, 50);
        }
    }
    
    onTutorialSeedPurchased() {
        if (this.tutorialActive) {
            this.tutorialData.seedsPurchased++;
            console.log('🎓 Tutorial: Seed purchased! Total:', this.tutorialData.seedsPurchased);
            this.updateTutorialObjectiveText(); // Update progress bar
        }
    }
    
    // Developer helper method to reset tutorial (call from console: window.gameManager.resetTutorial())
    resetTutorial() {
        console.log('🎓 Tutorial reset! Starting tutorial now...');
        this.startTutorial();
    }
    
    // Force start tutorial (call from console: window.gameManager.forceStartTutorial())
    forceStartTutorial() {
        console.log('🎓 DEBUG: Force starting tutorial...');
        this.tutorialActive = true;
        this.tutorialStep = 0;
        this.showTutorialStep();
        this.setupTutorialEventListeners();
        this.showTutorialObjective();
        console.log('🎓 Tutorial force started!');
    }
    
    // Console command to level up (call from console: levelUp() or levelUp(5) for multiple levels)
    levelUpConsole(levels = 1) {
        console.log(`🎉 Console Level Up! Adding ${levels} level(s)...`);
        for (let i = 0; i < levels; i++) {
            const xpNeeded = this.getTotalXPForLevel(this.currentLevel + 1) - this.currentXP;
            this.addXP(xpNeeded, 'console_command');
        }
        console.log(`🎉 Level up complete! Current level: ${this.currentLevel}`);
    }
    
    // Tutorial Objective UI Management
    showTutorialObjective() {
        console.log('🎯 DEBUG: showTutorialObjective called, tutorialActive:', this.tutorialActive);
        const objectiveElement = document.getElementById('tutorialObjective');
        console.log('🎯 DEBUG: Found objective element:', !!objectiveElement);
        
        if (this.tutorialActive && objectiveElement) {
            objectiveElement.classList.add('active');
            this.updateTutorialObjectiveText();
            console.log('🎯 DEBUG: Tutorial objective should now be visible!');
        } else {
            console.log('🎯 DEBUG: Tutorial objective not shown - tutorialActive:', this.tutorialActive, 'element found:', !!objectiveElement);
        }
    }
    
    hideTutorialObjective() {
        const objectiveElement = document.getElementById('tutorialObjective');
        objectiveElement.classList.remove('active');
    }
    
    updateTutorialObjectiveText() {
        const steps = this.getTutorialSteps();
        const currentStep = steps[this.tutorialStep];
        const objectiveTextElement = document.getElementById('tutorialObjectiveText');
        const objectiveIconElement = document.getElementById('tutorialObjectiveIcon');
        const progressContainer = document.getElementById('tutorialProgressContainer');
        const progressFill = document.getElementById('tutorialProgressFill');
        const progressText = document.getElementById('tutorialProgressText');
        
        if (currentStep) {
            // Create detailed objective text with improved wording
            let objectiveText = '';
            let icon = '🎯';
            let showProgress = false;
            let progressPercent = 0;
            let progressTextContent = '';
            
            switch(this.tutorialStep) {
                case 0:
                    icon = '🌱';
                    objectiveText = 'Welcome to Grow a Beanstalk! Let\'s get started!';
                    break;
                case 1:
                    icon = '🎒';
                    if (this.tutorialData.inventoryOpened) {
                        objectiveText = 'Step 1: Perfect! Inventory opened ✅';
                        showProgress = true;
                        progressPercent = 100;
                        progressTextContent = 'Inventory opened!';
                    } else {
                        objectiveText = 'Step 1: Click the inventory button';
                        showProgress = true;
                        progressPercent = 0;
                        progressTextContent = 'Click the inventory button';
                    }
                    break;
                case 2:
                    icon = '🪴';
                    if (this.tutorialData.plantsPlanted >= 1) {
                        objectiveText = 'Step 2: Excellent! Seed planted ✅';
                        showProgress = true;
                        progressPercent = 100;
                        progressTextContent = 'Seed planted successfully!';
                    } else {
                        objectiveText = 'Step 2: Drag a seed from your inventory onto an empty pot';
                        showProgress = true;
                        progressPercent = this.tutorialData.inventoryOpened ? 50 : 0;
                        progressTextContent = this.tutorialData.inventoryOpened ? 'Now drag a seed to a pot' : 'Open inventory first';
                    }
                    break;
                case 3:
                    icon = '🫘';
                    const beansNeeded = 25;
                    const beansCollected = this.tutorialData.beansCollected;
                    const beansRemaining = Math.max(0, beansNeeded - beansCollected);
                    
                    if (beansRemaining > 0) {
                        objectiveText = `Step 3: Wait for your plant to grow, then collect 25 beans!`;
                    } else {
                        objectiveText = 'Step 3: Amazing! You\'ve collected enough beans! ✅';
                    }
                    
                    showProgress = true;
                    progressPercent = Math.min((beansCollected / beansNeeded) * 100, 100);
                    progressTextContent = `${beansCollected} / ${beansNeeded} beans collected`;
                    break;
                case 4:
                    icon = '🏪';
                    if (this.tutorialData.seedsPurchased >= 1) {
                        objectiveText = 'Step 4: Perfect! Seed purchased ✅';
                        showProgress = true;
                        progressPercent = 100;
                        progressTextContent = 'Seed purchased successfully!';
                    } else {
                        objectiveText = 'Step 4: Use your coins to buy another seed from the shop!';
                        showProgress = true;
                        progressPercent = 0;
                        progressTextContent = 'Buy a seed from the shop';
                    }
                    break;
                case 5:
                    icon = '🥈';
                    const silverNeeded = 3;
                    const silverCollected = this.tutorialData.silverBeansCollected;
                    const silverRemaining = Math.max(0, silverNeeded - silverCollected);
                    
                    if (silverRemaining > 0) {
                        objectiveText = `Step 5: Find and collect ${silverRemaining} more silver beans (shiny variants)!`;
                    } else {
                        objectiveText = 'Step 5: Excellent! You\'ve collected all silver beans! ✅';
                    }
                    
                    showProgress = true;
                    progressPercent = Math.min((silverCollected / silverNeeded) * 100, 100);
                    progressTextContent = `${silverCollected} / ${silverNeeded} silver beans collected`;
                    break;
                case 6:
                    icon = '🥇';
                    const goldNeeded = 3;
                    const goldCollected = this.tutorialData.goldBeansCollected;
                    const goldRemaining = Math.max(0, goldNeeded - goldCollected);
                    
                    if (goldRemaining > 0) {
                        objectiveText = `Step 6: Find and collect ${goldRemaining} more golden beans (rarest variants)!`;
                    } else {
                        objectiveText = 'Step 6: Fantastic! Tutorial complete! ✅';
                    }
                    
                    showProgress = true;
                    progressPercent = Math.min((goldCollected / goldNeeded) * 100, 100);
                    progressTextContent = `${goldCollected} / ${goldNeeded} golden beans collected`;
                    break;
                default:
                    objectiveText = 'Follow the tutorial to learn the game!';
            }
            
            // Update the display
            objectiveTextElement.textContent = objectiveText;
            objectiveIconElement.textContent = icon;
            
            // Show/hide and update progress bar
            if (showProgress) {
                progressContainer.style.display = 'block';
                progressFill.style.width = progressPercent + '%';
                progressText.textContent = progressTextContent;
                
                // Add completion styling when progress reaches 100%
                if (progressPercent >= 100) {
                    progressFill.classList.add('complete');
                } else {
                    progressFill.classList.remove('complete');
                }
            } else {
                progressContainer.style.display = 'none';
            }
        }
    }

    // Show satisfying money burst effect
    showMoneyBurst(x, y, amount) {
        const burst = document.createElement('div');
        burst.className = 'money-burst';
        burst.textContent = `+$${amount.toLocaleString()}`;
        burst.style.left = (x - 50) + 'px'; // Center the text
        burst.style.top = (y - 10) + 'px';
        
        document.body.appendChild(burst);
        
        // Remove burst after animation
        setTimeout(() => {
            burst.remove();
        }, 1500);
    }

    // Initialize plant data
    initializePlantData() {
        return [
            // Common Plants
            { name: 'Beanstalk', type: 'Picker', growthTime: 25, buyPrice: 50, sellPrice: 14, rarity: 'Common', availability: 8 },
            { name: 'Snap Pea', type: 'Picker', growthTime: 75, buyPrice: 90, sellPrice: 90, rarity: 'Common', availability: 7 },
            { name: 'Jellybean Vine', type: 'Picker', growthTime: 90, buyPrice: 170, sellPrice: 170, rarity: 'Common', availability: 6 },
            { name: 'Bamboo-Bean', type: 'Cutter', growthTime: 120, buyPrice: 300, sellPrice: 300, rarity: 'Common', availability: 6 },
            { name: 'Coffee Creeper', type: 'Picker', growthTime: 120, buyPrice: 540, sellPrice: 540, rarity: 'Common', availability: 5 },
            { name: 'Thunder Pod', type: 'Cutter', growthTime: 150, buyPrice: 970, sellPrice: 970, rarity: 'Common', availability: 4 },
            { name: 'Frost Pea', type: 'Picker', growthTime: 150, buyPrice: 1700, sellPrice: 2700, rarity: 'Common', availability: 3 },
            { name: 'Choco Vine', type: 'Picker', growthTime: 180, buyPrice: 3000, sellPrice: 3500, rarity: 'Common', availability: 2 },
            
            // Uncommon Plants
            { name: 'Ironvine', type: 'Cutter', growthTime: 210, buyPrice: 5300, sellPrice: 15300, rarity: 'Uncommon', availability: 7 },
            { name: 'Honeyvine', type: 'Picker', growthTime: 180, buyPrice: 9300, sellPrice: 19300, rarity: 'Uncommon', availability: 6 },
            { name: 'Sunbean', type: 'Picker', growthTime: 240, buyPrice: 16000, sellPrice: 25500, rarity: 'Uncommon', availability: 5 },
            { name: 'Moonbean', type: 'Picker', growthTime: 240, buyPrice: 28000, sellPrice: 43000, rarity: 'Uncommon', availability: 4 },
            { name: 'Cloud Creeper', type: 'Picker', growthTime: 270, buyPrice: 49000, sellPrice: 49000, rarity: 'Uncommon', availability: 3 },
            { name: 'Royal Stalk', type: 'Cutter', growthTime: 300, buyPrice: 86000, sellPrice: 86000, rarity: 'Uncommon', availability: 2 },
            { name: 'Crystal Bean', type: 'Picker', growthTime: 300, buyPrice: 150000, sellPrice: 120000, rarity: 'Uncommon', availability: 1 },
            
            // Rare Plants
            { name: 'Neon Soy', type: 'Cutter', growthTime: 330, buyPrice: 260000, sellPrice: 160000, rarity: 'Rare', availability: 5 },
            { name: 'Vinecorn', type: 'Cutter', growthTime: 240, buyPrice: 450000, sellPrice: 210000, rarity: 'Rare', availability: 4 },
            { name: 'Fire Pod', type: 'Cutter', growthTime: 360, buyPrice: 780000, sellPrice: 280000, rarity: 'Rare', availability: 3 },
            { name: 'Shadow Bean', type: 'Picker', growthTime: 300, buyPrice: 1350000, sellPrice: 320000, rarity: 'Rare', availability: 2 },
            { name: 'Prism Stalk', type: 'Picker', growthTime: 480, buyPrice: 2340000, sellPrice: 340000, rarity: 'Rare', availability: 1 }
        ];
    }

    // Initialize modifier data
    initializeModifierData() {
        return {
            size: [
                { name: 'Normal', multiplier: 1.0, probability: 65, description: 'Standard size' },
                { name: 'Large', multiplier: 1.8, probability: 30, description: '×1.8 size boost' },
                { name: 'Massive', multiplier: 3.2, probability: 5, description: '×3.2 size boost' }
            ],
            finish: [
                { name: 'None', multiplier: 1.0, probability: 95, description: 'No special finish' },
                { name: 'Shiny', multiplier: 1.5, probability: 3, description: '×1.5 value boost' },
                { name: 'Golden', multiplier: 2.0, probability: 2, description: '×2.0 value boost' }
            ]
        };
    }
}

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
    window.gameManager = new GameManager();
    
    // Add global console commands for debugging
    window.levelUp = (levels = 1) => {
        if (window.gameManager) {
            window.gameManager.levelUpConsole(levels);
        } else {
            console.error('❌ Game not loaded yet! Wait for the game to start.');
        }
    };
    
    window.addXP = (amount) => {
        if (window.gameManager) {
            window.gameManager.addXP(amount, 'console_command');
            console.log(`✅ Added ${amount} XP! Current: ${window.gameManager.currentXP} XP, Level: ${window.gameManager.currentLevel}`);
        } else {
            console.error('❌ Game not loaded yet! Wait for the game to start.');
        }
    };
});

// Handle escape key to exit fullscreen
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && window.gameManager && window.gameManager.isFullscreen) {
        document.exitFullscreen();
        window.gameManager.isFullscreen = false;
    }
});

// Initialize floating beans animation when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Start floating beans animation on the start screen
    floatingBeansManager.start();
})