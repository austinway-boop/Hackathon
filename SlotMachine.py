"""
Grow A Beanstock - Slot Machine Mini-Game
A beautiful slot machine with spinning animations using pygame
"""

import pygame
import random
import math
import time
import os
import sys
from Setup import get_game_state, PLANT_SPECIES

# Initialize Pygame
pygame.init()

# Constants
WINDOW_WIDTH = 1000
WINDOW_HEIGHT = 700
FPS = 60

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GOLD = (255, 215, 0)
SILVER = (192, 192, 192)
GREEN = (0, 255, 0)
RED = (255, 0, 0)
BLUE = (0, 100, 255)
PURPLE = (128, 0, 128)
DARK_GREEN = (0, 100, 0)
BROWN = (139, 69, 19)

class SlotMachine:
    def __init__(self):
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        pygame.display.set_caption("🎰 Beanstock Slot Machine 🎰")
        self.clock = pygame.time.Clock()
        
        # Load assets
        self.load_assets()
        self.load_sounds()
        
        # Slot machine state
        self.spinning = False
        self.spin_speed = 0
        self.spin_positions = [0, 0, 0]  # Current positions of each reel
        self.target_positions = [0, 0, 0]  # Where each reel should stop
        self.reel_speeds = [0, 0, 0]  # Individual reel speeds
        self.spin_start_time = 0
        self.credits = 0
        
        # Visual effects
        self.particles = []
        self.flash_timer = 0
        self.win_animation_timer = 0
        
        # Load game state
        self.load_credits()
        
        # Create bean list from game species
        self.create_bean_list()
        
        # Font
        self.font_large = pygame.font.Font(None, 48)
        self.font_medium = pygame.font.Font(None, 36)
        self.font_small = pygame.font.Font(None, 24)
        
        print("🎰 Slot Machine initialized! Spin to win!")

    def load_assets(self):
        """Load bean images and other assets"""
        self.bean_images = {}
        assets_path = os.path.join(os.path.dirname(__file__), "Assets", "BasicBeans")
        
        # Map species IDs to image filenames
        bean_image_map = {
            'beanstalk': 'beanstalkbean.png',
            'snap_pea': 'Snappeabean.png',
            'jellybean_vine': 'Jellybean.png',
            'bamboo_bean': 'Bamboobean.png',
            'coffee_beanstalk': 'Coffebean.png',
            'thunder_pod': 'Thunderboltpeabean.png',
            'frost_pea': 'Frostbean.png',
            'choco_vine': 'Chocobean.png',
            'ironvine': 'Ironbean.png',
            'honeyvine': 'Honeybean.png',
            'sunbean': 'Sunbean.png',
            'moonbean': 'Moombean.png',
            'cloud_creeper': 'Cloudbean.png',
            'royal_stalk': 'Royalbean.png',
            'crystal_bean': 'Crystalbean.png',
            'neon_soy': 'Neonbean.png',
            'vinecorn': 'Cornbean.png',
            'fire_pod': 'Firebean.png',
            'shadow_bean': 'Shadowbean.png',
            'prism_stalk': 'Prysmbean.png'
        }
        
        for species_id, filename in bean_image_map.items():
            try:
                path = os.path.join(assets_path, filename)
                image = pygame.image.load(path)
                # Scale to slot size
                self.bean_images[species_id] = pygame.transform.scale(image, (100, 100))
            except FileNotFoundError:
                print(f"⚠️ Warning: Could not find {filename}")
                # Create a placeholder
                placeholder = pygame.Surface((100, 100))
                placeholder.fill((128, 128, 128))
                self.bean_images[species_id] = placeholder

    def load_sounds(self):
        """Load sound effects"""
        self.sounds = {}
        sounds_path = os.path.join(os.path.dirname(__file__), "Sound")
        
        sound_files = {
            'spin': 'swoosh.mp3',
            'coin': 'coin.mp3',
            'win': 'goldcollect.mp3',
            'big_win': 'levelup.mp3',
            'collect': 'collectbean.mp3'
        }
        
        try:
            pygame.mixer.init()
            for sound_name, filename in sound_files.items():
                try:
                    path = os.path.join(sounds_path, filename)
                    self.sounds[sound_name] = pygame.mixer.Sound(path)
                except (FileNotFoundError, pygame.error):
                    print(f"⚠️ Warning: Could not load {filename}")
        except pygame.error:
            print("⚠️ Warning: Could not initialize sound mixer")

    def create_bean_list(self):
        """Create weighted list of beans based on rarity"""
        self.beans = []
        
        # Add beans based on rarity (more common beans appear more often)
        rarity_weights = {
            'common': 8,
            'uncommon': 4,
            'rare': 2,
            'legendary': 1,
            'mythical': 1,
            'ultra_mythical': 1,
            'godly': 1
        }
        
        for species_id, species in PLANT_SPECIES.items():
            if species_id in self.bean_images:
                weight = rarity_weights.get(species.rarity, 1)
                for _ in range(weight):
                    self.beans.append(species_id)
        
        print(f"🎲 Created bean pool with {len(set(self.beans))} unique beans, {len(self.beans)} total weighted entries")

    def load_credits(self):
        """Load credits from game state"""
        try:
            game_state = get_game_state()
            self.credits = game_state.coins
        except Exception as e:
            print(f"⚠️ Warning: Could not load game state: {e}")
            self.credits = 1000  # Default credits

    def save_credits(self):
        """Save credits back to game state"""
        try:
            game_state = get_game_state()
            game_state.coins = self.credits
        except Exception as e:
            print(f"⚠️ Warning: Could not save game state: {e}")

    def spin_reels(self):
        """Start spinning the reels"""
        if self.spinning or self.credits < 100:  # 100 coins per spin
            return
        
        self.credits -= 100  # Deduct spin cost
        self.spinning = True
        self.spin_start_time = time.time()
        
        # Set random target positions
        self.target_positions = [
            random.randint(0, len(self.beans) - 1),
            random.randint(0, len(self.beans) - 1),
            random.randint(0, len(self.beans) - 1)
        ]
        
        # Set initial spin speeds (different for each reel)
        self.reel_speeds = [
            random.uniform(20, 30),
            random.uniform(25, 35),
            random.uniform(20, 30)
        ]
        
        # Play spin sound
        if 'spin' in self.sounds:
            self.sounds['spin'].play()
        
        print(f"🎰 Spinning! Credits remaining: {self.credits}")

    def update_reels(self, dt):
        """Update reel positions during spin"""
        if not self.spinning:
            return
        
        spin_time = time.time() - self.spin_start_time
        all_stopped = True
        
        for i in range(3):
            # Calculate when this reel should stop (staggered)
            stop_time = 2.0 + (i * 0.8)  # Reel 0 stops at 2s, reel 1 at 2.8s, reel 2 at 3.6s
            
            if spin_time < stop_time:
                # Still spinning
                self.spin_positions[i] = (self.spin_positions[i] + self.reel_speeds[i] * dt) % len(self.beans)
                all_stopped = False
            else:
                # Gradually slow down and stop at target
                decel_factor = max(0, 1 - ((spin_time - stop_time) / 1.0))
                if decel_factor > 0:
                    self.reel_speeds[i] *= decel_factor
                    self.spin_positions[i] = (self.spin_positions[i] + self.reel_speeds[i] * dt) % len(self.beans)
                else:
                    # Snap to target position
                    self.spin_positions[i] = self.target_positions[i]
        
        if all_stopped:
            self.spinning = False
            self.check_win()

    def check_win(self):
        """Check if the player won and award prizes"""
        # Get the beans that landed
        result_beans = [
            self.beans[int(self.spin_positions[0])],
            self.beans[int(self.spin_positions[1])],
            self.beans[int(self.spin_positions[2])]
        ]
        
        print(f"🎯 Result: {[PLANT_SPECIES[bean].name for bean in result_beans]}")
        
        # Check for matches
        unique_beans = set(result_beans)
        
        if len(unique_beans) == 1:
            # Three of a kind - JACKPOT!
            bean_species = PLANT_SPECIES[result_beans[0]]
            payout = bean_species.base_sell * 5  # 5x the bean's base value
            self.credits += payout
            
            self.start_win_animation(payout, "JACKPOT!")
            if 'big_win' in self.sounds:
                self.sounds['big_win'].play()
            
            print(f"🎉 JACKPOT! Three {bean_species.name}s! Won {payout} coins!")
            
        elif len(unique_beans) == 2:
            # Two of a kind
            # Find which bean appears twice
            for bean in unique_beans:
                if result_beans.count(bean) == 2:
                    bean_species = PLANT_SPECIES[bean]
                    payout = bean_species.base_sell * 2  # 2x the bean's base value
                    self.credits += payout
                    
                    self.start_win_animation(payout, "Two of a Kind!")
                    if 'win' in self.sounds:
                        self.sounds['win'].play()
                    
                    print(f"🎊 Two of a Kind! Two {bean_species.name}s! Won {payout} coins!")
                    break
        else:
            # No match, but give a small consolation based on rarest bean
            rarest_value = max(PLANT_SPECIES[bean].base_sell for bean in result_beans)
            if rarest_value > 1000:  # Only for rare+ beans
                payout = rarest_value // 10  # 10% of the rarest bean's value
                self.credits += payout
                if 'coin' in self.sounds:
                    self.sounds['coin'].play()
                print(f"🍀 Consolation prize: {payout} coins for rare bean!")
            else:
                print("💔 No match, try again!")
        
        self.save_credits()

    def start_win_animation(self, payout, message):
        """Start win animation effects"""
        self.win_animation_timer = 3.0  # 3 seconds of celebration
        self.flash_timer = 0.5
        
        # Create celebratory particles
        for _ in range(20):
            self.particles.append({
                'x': WINDOW_WIDTH // 2,
                'y': WINDOW_HEIGHT // 2,
                'vx': random.uniform(-200, 200),
                'vy': random.uniform(-300, -100),
                'life': random.uniform(1.0, 2.0),
                'color': random.choice([GOLD, SILVER, GREEN, BLUE])
            })

    def update_particles(self, dt):
        """Update particle effects"""
        for particle in self.particles[:]:
            particle['x'] += particle['vx'] * dt
            particle['y'] += particle['vy'] * dt
            particle['vy'] += 500 * dt  # Gravity
            particle['life'] -= dt
            
            if particle['life'] <= 0:
                self.particles.remove(particle)

    def draw_reel(self, x, y, position):
        """Draw a single reel"""
        reel_rect = pygame.Rect(x, y, 120, 120)
        pygame.draw.rect(self.screen, WHITE, reel_rect)
        pygame.draw.rect(self.screen, BLACK, reel_rect, 3)
        
        # Draw the bean
        bean_index = int(position) % len(self.beans)
        bean_id = self.beans[bean_index]
        
        if bean_id in self.bean_images:
            bean_image = self.bean_images[bean_id]
            image_rect = bean_image.get_rect(center=reel_rect.center)
            self.screen.blit(bean_image, image_rect)
        
        # Add spinning effect
        if self.spinning:
            overlay = pygame.Surface((120, 120))
            overlay.set_alpha(50)
            overlay.fill(WHITE)
            self.screen.blit(overlay, (x, y))

    def draw_ui(self):
        """Draw the user interface"""
        # Title
        title = self.font_large.render("🎰 BEANSTOCK SLOTS 🎰", True, GOLD)
        title_rect = title.get_rect(center=(WINDOW_WIDTH // 2, 50))
        self.screen.blit(title, title_rect)
        
        # Credits display
        credits_text = self.font_medium.render(f"Credits: {self.credits:,}", True, GREEN)
        self.screen.blit(credits_text, (50, 100))
        
        # Spin cost
        cost_text = self.font_small.render("100 coins per spin", True, WHITE)
        self.screen.blit(cost_text, (50, 130))
        
        # Instructions
        if not self.spinning:
            if self.credits >= 100:
                instruction = self.font_medium.render("Press SPACEBAR to spin!", True, GREEN)
            else:
                instruction = self.font_medium.render("Not enough credits!", True, RED)
        else:
            instruction = self.font_medium.render("Spinning...", True, BLUE)
        
        instruction_rect = instruction.get_rect(center=(WINDOW_WIDTH // 2, 600))
        self.screen.blit(instruction, instruction_rect)
        
        # ESC to quit
        quit_text = self.font_small.render("Press ESC to quit", True, WHITE)
        self.screen.blit(quit_text, (WINDOW_WIDTH - 200, WINDOW_HEIGHT - 30))
        
        # Win animation overlay
        if self.win_animation_timer > 0:
            if self.flash_timer > 0:
                # Flashing effect
                flash_surface = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT))
                flash_surface.set_alpha(100)
                flash_surface.fill(GOLD)
                self.screen.blit(flash_surface, (0, 0))
            
            # Big win text
            win_text = self.font_large.render("🎉 WIN! 🎉", True, GOLD)
            win_rect = win_text.get_rect(center=(WINDOW_WIDTH // 2, 150))
            self.screen.blit(win_text, win_rect)

    def draw_particles(self):
        """Draw particle effects"""
        for particle in self.particles:
            alpha = max(0, min(255, int(particle['life'] * 255)))
            color = (*particle['color'][:3], alpha)
            
            # Create a surface for the particle with alpha
            particle_surface = pygame.Surface((6, 6))
            particle_surface.set_alpha(alpha)
            particle_surface.fill(particle['color'])
            
            self.screen.blit(particle_surface, (int(particle['x']), int(particle['y'])))

    def run(self):
        """Main game loop"""
        running = True
        
        print("🎮 Slot Machine is running!")
        print("💡 Press SPACEBAR to spin, ESC to quit")
        
        while running:
            dt = self.clock.tick(FPS) / 1000.0
            
            # Handle events
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_SPACE:
                        self.spin_reels()
                    elif event.key == pygame.K_ESCAPE:
                        running = False
            
            # Update game state
            self.update_reels(dt)
            self.update_particles(dt)
            
            # Update timers
            if self.flash_timer > 0:
                self.flash_timer -= dt
            if self.win_animation_timer > 0:
                self.win_animation_timer -= dt
            
            # Draw everything
            self.screen.fill(DARK_GREEN)  # Background
            
            # Draw reels
            reel_y = 250
            for i in range(3):
                reel_x = 200 + (i * 200)
                self.draw_reel(reel_x, reel_y, self.spin_positions[i])
            
            # Draw UI
            self.draw_ui()
            
            # Draw particles
            self.draw_particles()
            
            pygame.display.flip()
        
        pygame.quit()
        print(f"🎰 Slot Machine closed. Final credits: {self.credits}")

def start_slot_machine():
    """Start the slot machine mini-game"""
    try:
        slot_machine = SlotMachine()
        slot_machine.run()
    except Exception as e:
        print(f"❌ Error starting slot machine: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    start_slot_machine()
