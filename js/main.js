// Create instances of managers
const floatingBeansManager = new FloatingBeansManager();
const gameManager = new GameManager();

// Initialize the game manager
gameManager.init();

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
    
    // Add global functions for console commands (useful for testing)
    window.gameManager = gameManager;
    
    window.addMoney = (amount) => {
        if (window.gameManager) {
            window.gameManager.money += amount;
            window.gameManager.updateUI();
            console.log(`✅ Added $${amount}! Current balance: $${window.gameManager.money}`);
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
    
    window.forceClippers = () => {
        if (window.gameManager) {
            // Force check and create clippers for all pots that need them
            window.gameManager.pots.forEach((potData, potIndex) => {
                if (potData && potData.clipper_unlocked && potData.instance_id) {
                    console.log(`✂️ Force creating clipper for pot ${potIndex}`);
                    window.gameManager.createOrUpdateClipper(potIndex, potData.clipper_level || 1);
                }
            });
            console.log('✅ Clipper creation forced! Check pots for ✂️ icons.');
        } else {
            console.error('❌ Game not loaded yet! Wait for the game to start.');
        }
    };
});