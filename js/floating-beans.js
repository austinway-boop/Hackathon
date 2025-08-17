// Floating Beans Animation System
class FloatingBeansManager {
    constructor() {
        this.container = document.getElementById('floatingBeansContainer');
        this.beanTypes = [
            'Bamboobean.png', 'beanstalkbean.png', 'Chocobean.png', 'Cloudbean.png', 
            'Coffebean.png', 'Cornbean.png', 'Crystalbean.png', 'Firebean.png', 
            'Frostbean.png', 'Honeybean.png', 'Ironbean.png', 'Jellybean.png', 
            'Moombean.png', 'Neonbean.png', 'Prysmbean.png', 'Royalbean.png', 
            'Shadowbean.png', 'Snappeabean.png', 'Sunbean.png', 'Thunderboltpeabean.png'
        ];
        this.activeBeans = new Set();
        this.spawnInterval = null;
        this.isActive = false;
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        
        // Start with initial burst of beans
        for (let i = 0; i < 15; i++) {
            setTimeout(() => {
                this.spawnBeanBurst();
            }, i * 100);
        }
        
        // Continue spawning beans much more frequently for dense effect
        this.spawnInterval = setInterval(() => {
            this.spawnBeanBurst();
        }, 300); // Much faster - every 300ms
        
        // Cleanup old beans every 1.5 seconds
        setInterval(() => {
            this.cleanupBeans();
        }, 1500);
    }

    stop() {
        if (!this.isActive) return;
        this.isActive = false;
        
        if (this.spawnInterval) {
            clearInterval(this.spawnInterval);
            this.spawnInterval = null;
        }
        
        // Remove all floating beans
        this.container.innerHTML = '';
        this.activeBeans.clear();
    }

    spawnBean() {
        if (!this.isActive || !this.container) return;
        
        // Create bean element
        const beanDiv = document.createElement('div');
        const beanImg = document.createElement('img');
        
        // Random bean type
        const randomBeanType = this.beanTypes[Math.floor(Math.random() * this.beanTypes.length)];
        beanImg.src = `Assets/BasicBeans/${randomBeanType}`;
        beanImg.alt = 'Floating Bean';
        
        beanDiv.appendChild(beanImg);
        beanDiv.className = 'floating-bean';
        
        // Random starting position (horizontal)
        const startX = Math.random() * (window.innerWidth - 40); // 40px is bean width
        beanDiv.style.left = `${startX}px`;
        
        // Random animation variation
        const variations = ['', 'slow', 'fast', 'super-fast', 'reverse', 'wobble', 'spiral', 'bounce'];
        const randomVariation = variations[Math.floor(Math.random() * variations.length)];
        if (randomVariation) {
            beanDiv.classList.add(randomVariation);
        }
        
        // Random size variation
        const sizeVariation = 0.7 + Math.random() * 0.6; // 0.7 to 1.3x
        beanDiv.style.setProperty('--size-multiplier', sizeVariation);
        beanDiv.style.width = `${40 * sizeVariation}px`;
        beanDiv.style.height = `${40 * sizeVariation}px`;
        
        // Add to container and track
        this.container.appendChild(beanDiv);
        this.activeBeans.add(beanDiv);
        
        // Remove bean after animation completes
        const animationDuration = beanDiv.classList.contains('slow') ? 12000 : 
                                 beanDiv.classList.contains('fast') ? 5000 : 
                                 beanDiv.classList.contains('super-fast') ? 3500 : 8000;
        
        setTimeout(() => {
            if (beanDiv.parentNode) {
                beanDiv.parentNode.removeChild(beanDiv);
            }
            this.activeBeans.delete(beanDiv);
        }, animationDuration);
    }

    spawnBeanBurst() {
        // Spawn multiple beans at once for dense effect
        const burstSize = 2 + Math.floor(Math.random() * 4); // 2-5 beans per burst
        
        for (let i = 0; i < burstSize; i++) {
            // Stagger the spawn slightly for more natural flow
            setTimeout(() => {
                this.spawnBean();
            }, i * 50); // 50ms between each bean in the burst
        }
    }

    cleanupBeans() {
        // Remove beans that may have gotten stuck or lost
        const beans = this.container.querySelectorAll('.floating-bean');
        beans.forEach(bean => {
            const rect = bean.getBoundingClientRect();
            // If bean is way off screen (above viewport), remove it
            if (rect.bottom < -100) {
                if (bean.parentNode) {
                    bean.parentNode.removeChild(bean);
                }
                this.activeBeans.delete(bean);
            }
        });
    }
}

// Initialize floating beans manager
const floatingBeansManager = new FloatingBeansManager();