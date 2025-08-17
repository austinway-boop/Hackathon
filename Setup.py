"""
Grow A Beanstock - Game Setup and Initialization
This file contains the core game logic, data structures, and initialization.
"""

import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

class PlantSpecies:
    """Defines a plant species with growth characteristics"""
    def __init__(self, id: str, name: str, type: str, grow_time: int, base_sell: int, seed_cost: int, rarity: str = 'common'):
        self.id = id
        self.name = name
        self.type = type  # 'picker' or 'cutter'
        self.grow_time = grow_time  # seconds to first ready
        self.base_sell = base_sell
        self.seed_cost = seed_cost
        self.rarity = rarity  # Rarity tier for shop spawn chances

class PlantInstance:
    """Represents a specific planted seed with its characteristics"""
    def __init__(self, species_id: str, planted_at: float, rarity: Dict[str, str]):
        self.species_id = species_id
        self.planted_at = planted_at
        self.picks_done = 0
        self.rarity = rarity  # {'size': 'normal'|'large'|'massive', 'finish': 'none'|'shiny'|'golden'}
        self.ready_state = 'growing'  # 'growing'|'ready'|'harvested'
        
        # Leveling system
        self.level = 1
        self.experience = 0
        self.clipper_unlocked = False
        self.clipper_level = 0

class Pot:
    """Represents a planting pot"""
    def __init__(self, index: int):
        self.index = index
        self.state = 'empty'  # 'empty'|'growing'|'ready'|'harvested'
        self.instance_id: Optional[str] = None

class ShopSlot:
    """Represents a shop slot with species and pricing"""
    def __init__(self, species_id: str, stock: int, base_price: int):
        self.species_id = species_id
        self.stock = stock
        self.base_price = base_price
        self.purchases_this_roll = 0

class Shop:
    """Manages the seed shop"""
    def __init__(self):
        self.refresh_at = time.time() + 180  # 3 minutes from now
        self.slots: List[ShopSlot] = []
        self.refresh_shop()

    def refresh_shop(self):
        """Refresh shop with new seeds based on rarity spawn chances"""
        import random
        self.slots = []
        
        # Get all species grouped by rarity
        species_by_rarity = {}
        for species_id, species in PLANT_SPECIES.items():
            rarity = species.rarity
            if rarity not in species_by_rarity:
                species_by_rarity[rarity] = []
            species_by_rarity[rarity].append(species_id)
        
        # Track already spawned species to prevent duplicates
        spawned_species = set()
        max_slots = 8
        attempts = 0
        max_attempts = 50  # Prevent infinite loops
        
        while len(self.slots) < max_slots and attempts < max_attempts:
            attempts += 1
            spawned = False
            rarities = list(RARITY_CONFIG.keys())
            # Shuffle rarities for random selection order
            random.shuffle(rarities)
            
            for rarity in rarities:
                config = RARITY_CONFIG[rarity]
                if random.random() < config['spawn_chance']:
                    # This rarity spawns! Pick a random species from this rarity that we haven't spawned yet
                    if rarity in species_by_rarity:
                        available_species = [s for s in species_by_rarity[rarity] if s not in spawned_species]
                        if available_species:  # Only spawn if we have species left in this rarity
                            species_id = random.choice(available_species)
                            species = PLANT_SPECIES[species_id]
                            
                            # Generate random quantity based on rarity
                            quantity = random.randint(config['min_qty'], config['max_qty'])
                            
                            slot = ShopSlot(species_id, quantity, species.seed_cost)
                            self.slots.append(slot)
                            spawned_species.add(species_id)
                            spawned = True
                            break
            
            # If nothing spawned and we have few slots, try to force spawn a common that we haven't used
            if not spawned and len(self.slots) < 4 and 'common' in species_by_rarity:
                available_commons = [s for s in species_by_rarity['common'] if s not in spawned_species]
                if available_commons:
                    species_id = random.choice(available_commons)
                    species = PLANT_SPECIES[species_id]
                    config = RARITY_CONFIG['common']
                    quantity = random.randint(config['min_qty'], config['max_qty'])
                    slot = ShopSlot(species_id, quantity, species.seed_cost)
                    self.slots.append(slot)
                    spawned_species.add(species_id)
        
        self.refresh_at = time.time() + 180  # Next refresh in 3 minutes

class GameState:
    """Main game state manager"""
    def __init__(self):
        self.coins = 120  # Starting coins
        self.pots: List[Pot] = [Pot(i) for i in range(12)]
        self.plant_instances: Dict[str, PlantInstance] = {}
        self.shop = Shop()
        self.last_save = time.time()
        
        # Reset all clipper states on initialization (they don't persist)
        self.reset_all_clipper_states()

    def reset_all_clipper_states(self):
        """Reset all clipper states - clippers don't persist between sessions"""
        for instance in self.plant_instances.values():
            instance.clipper_unlocked = False
            instance.clipper_level = 0
            instance.clipper_experience = 0
    
    def generate_rarity(self) -> Dict[str, str]:
        """Generate random rarity for a plant"""
        import random
        
        # Size rarity: Normal 65%, Large 30%, Massive 5%
        size_roll = random.random()
        if size_roll < 0.65:
            size = 'normal'
        elif size_roll < 0.95:
            size = 'large'
        else:
            size = 'massive'
        
        # Finish rarity: None 94%, Silver Shiny 3%, Golden 3%
        finish_roll = random.random()
        if finish_roll < 0.94:
            finish = 'none'
        elif finish_roll < 0.97:
            finish = 'shiny'  # Silver shiny
        else:
            finish = 'golden'
        
        return {'size': size, 'finish': finish}

    def calculate_multiplier(self, rarity: Dict[str, str]) -> float:
        """Calculate sell price multiplier based on rarity"""
        multiplier = 1.0
        
        # Size multipliers
        if rarity['size'] == 'large':
            multiplier *= 1.8
        elif rarity['size'] == 'massive':
            multiplier *= 3.2
        
        # Finish multipliers
        if rarity['finish'] == 'shiny':
            multiplier *= 3.0  # 200% more valuable (3x multiplier)
        elif rarity['finish'] == 'golden':
            multiplier *= 6.0  # 500% more valuable (6x multiplier)
        
        return multiplier

    def get_experience_required_for_level(self, level: int, species_id: str) -> int:
        """Calculate experience required for a specific level based on plant cost (cheaper plants level easier)"""
        species = PLANT_SPECIES[species_id]
        # Much easier leveling - especially for cheaper plants
        # Beanstalk (120 cost) should be easy to max out
        if species.seed_cost <= 120:
            base_xp = 5  # Very easy for normal beanstalk
        elif species.seed_cost <= 500:
            base_xp = 8  # Still pretty easy for mid-tier
        elif species.seed_cost <= 1000:
            base_xp = 12  # Moderate for expensive plants
        else:
            base_xp = 15  # Harder for very expensive plants
        
        # Much gentler curve - almost linear growth
        return int(base_xp + (level - 1) * 2)  # Almost linear growth, just +2 XP per level
    
    def add_plant_experience(self, instance_id: str, xp_amount: int) -> Dict[str, Any]:
        """Add experience to a plant and handle leveling up - INFINITE SCALING"""
        if instance_id not in self.plant_instances:
            return {"leveled_up": False, "new_level": 1}
        
        instance = self.plant_instances[instance_id]
        old_level = instance.level
        instance.experience += xp_amount
        
        # INFINITE LEVELING - NO CAP, NO RESET, JUST PURE PROGRESSION
        while True:
            required_xp = self.get_experience_required_for_level(instance.level + 1, instance.species_id)
            if instance.experience >= required_xp:
                instance.experience -= required_xp
                instance.level += 1
                
                # Unlock clippers at level 25 but DON'T RESET
                if instance.level == 25 and not getattr(instance, 'clipper_unlocked', False):
                    instance.clipper_unlocked = True
                    instance.clipper_level = 1
                    instance.clipper_experience = 0
            else:
                break
        
        return {
            "leveled_up": instance.level > old_level,
            "old_level": old_level,
            "new_level": instance.level,
            "experience": instance.experience,
            "clipper_unlocked": getattr(instance, 'clipper_unlocked', False),
            "clipper_level": getattr(instance, 'clipper_level', 0)
        }
    
    def add_clipper_experience(self, instance_id: str, xp_amount: float) -> Dict[str, Any]:
        """Add experience to a clipper and handle leveling up"""
        if instance_id not in self.plant_instances:
            return {"leveled_up": False, "new_level": 0}
        
        instance = self.plant_instances[instance_id]
        
        # Initialize clipper attributes if not present
        if not hasattr(instance, 'clipper_level'):
            instance.clipper_level = 0
        if not hasattr(instance, 'clipper_experience'):
            instance.clipper_experience = 0
        if not hasattr(instance, 'clipper_unlocked'):
            instance.clipper_unlocked = False
            
        # Only add XP if clippers are unlocked
        if not instance.clipper_unlocked:
            return {"leveled_up": False, "new_level": 0}
        
        old_level = instance.clipper_level
        instance.clipper_experience += xp_amount
        
        # Check for clipper level up (max clipper level is 25)
        while instance.clipper_level < 25:
            # Simpler XP requirement for clippers
            required_xp = 100 * (instance.clipper_level ** 1.2)
            if instance.clipper_experience >= required_xp:
                instance.clipper_experience -= required_xp
                instance.clipper_level += 1
            else:
                break
        
        return {
            "leveled_up": instance.clipper_level > old_level,
            "old_level": old_level,
            "new_level": instance.clipper_level,
            "experience": instance.clipper_experience
        }
    
    def get_plant_level_multipliers(self, instance_id: str) -> Dict[str, float]:
        """Get all level-based multipliers for a plant - BALANCED INFINITE SCALING"""
        if instance_id not in self.plant_instances:
            return {"money": 1.0, "spawn_rate": 1.0, "special_chance": 1.0}
        
        instance = self.plant_instances[instance_id]
        level = instance.level
        
        # MONEY MULTIPLIER: More balanced logarithmic growth
        # Level 1: 1x, Level 10: 1.9x, Level 25: 3x, Level 50: 4x, Level 100: 5.5x, Level 200: 7x
        # Uses square root for diminishing returns
        import math
        money_multiplier = 1.0 + math.sqrt(level - 1) * 0.5
        
        # SPAWN RATE: Reasonable increase (not too crazy)
        # Level 1: 1x, Level 25: 1.5x, Level 50: 2x, Level 100: 3x
        spawn_rate_multiplier = 1.0 + math.sqrt(level - 1) * 0.2
        
        # SPECIAL CHANCE: Better rare beans but not insane
        # Level 1: 1x, Level 25: 2x, Level 50: 3x, Level 100: 4x
        special_chance_multiplier = 1.0 + math.log(level + 1) * 0.3
        
        return {
            "money": money_multiplier,
            "spawn_rate": spawn_rate_multiplier,
            "special_chance": special_chance_multiplier
        }

    def buy_seed(self, slot_index: int, pot_index: int = -1) -> bool:
        """Buy a seed and optionally plant it in a pot. If pot_index is -1, add to inventory"""
        print(f"🛒 DEBUG: buy_seed called with slot_index={slot_index}, pot_index={pot_index}")
        
        if slot_index >= len(self.shop.slots):
            print(f"❌ DEBUG: Invalid slot_index {slot_index}, shop has {len(self.shop.slots)} slots")
            return False
        
        slot = self.shop.slots[slot_index]
        print(f"📦 DEBUG: Slot found - species: {slot.species_id}, stock: {slot.stock}")
        
        if slot.stock <= 0:
            print(f"❌ DEBUG: No stock available, stock: {slot.stock}")
            return False
        
        # If pot_index is specified, check if pot is available
        if pot_index >= 0:
            if pot_index >= len(self.pots):
                print(f"❌ DEBUG: Invalid pot_index {pot_index}, have {len(self.pots)} pots")
                return False
            pot = self.pots[pot_index]
            if pot.state != 'empty':
                print(f"❌ DEBUG: Pot {pot_index} is not empty, state: {pot.state}")
                return False
        
        # Calculate price with repeat purchase tax
        price = slot.base_price
        if slot.purchases_this_roll > 0:
            if slot.purchases_this_roll == 1:
                price = int(price * 1.1)  # +10%
            else:
                price = int(price * 1.25)  # +25%
        
        print(f"💰 DEBUG: Price calculation - base: {slot.base_price}, final: {price}, player coins: {self.coins}")
        
        if self.coins < price:
            print(f"❌ DEBUG: Not enough coins, need: {price}, have: {self.coins}")
            return False
        
        # Deduct coins and update slot
        self.coins -= price
        slot.stock -= 1
        slot.purchases_this_roll += 1
        
        if pot_index >= 0:
            # Plant directly in pot
            pot = self.pots[pot_index]
            instance_id = f"plant_{time.time()}_{pot_index}"
            rarity = self.generate_rarity()
            instance = PlantInstance(slot.species_id, time.time(), rarity)
            
            # Plant in pot
            self.plant_instances[instance_id] = instance
            pot.instance_id = instance_id
            pot.state = 'growing'
        else:
            # Add to inventory (handled client-side for now)
            pass
        
        return True

    def update_plants(self):
        """Update all growing plants"""
        current_time = time.time()
        
        for pot in self.pots:
            if pot.state == 'growing' and pot.instance_id:
                instance = self.plant_instances[pot.instance_id]
                species = PLANT_SPECIES[instance.species_id]
                
                # Check if plant is ready
                if current_time >= instance.planted_at + species.grow_time:
                    instance.ready_state = 'ready'
                    pot.state = 'ready'

    def save_game(self) -> str:
        """Save game state to JSON"""
        save_data = {
            'coins': self.coins,
            'pots': [{'index': p.index, 'state': p.state, 'instance_id': p.instance_id} for p in self.pots],
            'plant_instances': {
                k: {
                    'species_id': v.species_id,
                    'planted_at': v.planted_at,
                    'picks_done': v.picks_done,
                    'rarity': v.rarity,
                    'ready_state': v.ready_state,
                    'level': v.level,
                    'experience': v.experience
                    # NOTE: Clipper states are NOT saved - they reset each session
                } for k, v in self.plant_instances.items()
            },
            'shop': {
                'refresh_at': self.shop.refresh_at,
                'slots': [
                    {
                        'species_id': s.species_id,
                        'stock': s.stock,
                        'base_price': s.base_price,
                        'purchases_this_roll': s.purchases_this_roll
                    } for s in self.shop.slots
                ]
            },
            'last_save': time.time()
        }
        return json.dumps(save_data)

# Plant species definitions with rarity categories
PLANT_SPECIES = {
    # Common rarity - Slowed down growth times by ~40%
    'beanstalk': PlantSpecies('beanstalk', 'Beanstalk', 'picker', 35, 14, 120, 'common'),
    'snap_pea': PlantSpecies('snap_pea', 'Snap Pea', 'picker', 105, 90, 560, 'common'),
    
    # Uncommon rarity - Slowed down growth times by ~40%
    'jellybean_vine': PlantSpecies('jellybean_vine', 'Jellybean Vine', 'picker', 125, 170, 1285, 'uncommon'),
    'bamboo_bean': PlantSpecies('bamboo_bean', 'Bamboo-Bean', 'cutter', 170, 300, 5410, 'uncommon'),
    'coffee_beanstalk': PlantSpecies('coffee_beanstalk', 'Coffee Beanstalk', 'picker', 170, 540, 9300, 'uncommon'),
    
    # Rare rarity - Slowed down growth times by ~40%
    'thunder_pod': PlantSpecies('thunder_pod', 'Thunder Pod', 'cutter', 210, 970, 17000, 'rare'),
    'frost_pea': PlantSpecies('frost_pea', 'Frost Pea', 'picker', 210, 2700, 31000, 'rare'),
    'choco_vine': PlantSpecies('choco_vine', 'Choco Vine', 'picker', 250, 3500, 35200, 'rare'),
    
    # Legendary rarity - Slowed down growth times by ~40%
    'ironvine': PlantSpecies('ironvine', 'Ironvine', 'cutter', 295, 15300, 90000, 'legendary'),
    'honeyvine': PlantSpecies('honeyvine', 'Honeyvine', 'picker', 250, 19300, 180000, 'legendary'),
    'sunbean': PlantSpecies('sunbean', 'Sunbean', 'picker', 340, 25500, 193000, 'legendary'),
    
    # Mythical rarity - Slowed down growth times by ~40%
    'moonbean': PlantSpecies('moonbean', 'Moonbean', 'picker', 340, 43000, 253000, 'mythical'),
    'cloud_creeper': PlantSpecies('cloud_creeper', 'Cloud Creeper', 'picker', 380, 49000, 295000, 'mythical'),
    
    # Ultra-Mythical rarity - Slowed down growth times by ~40%
    'royal_stalk': PlantSpecies('royal_stalk', 'Royal Stalk', 'cutter', 420, 86000, 465000, 'ultra_mythical'),
    'crystal_bean': PlantSpecies('crystal_bean', 'Crystal Bean', 'picker', 420, 120000, 600000, 'ultra_mythical'),
    'neon_soy': PlantSpecies('neon_soy', 'Neon Soy', 'cutter', 460, 160000, 570000, 'ultra_mythical'),
    
    # Godly rarity - Slowed down growth times by ~40%
    'vinecorn': PlantSpecies('vinecorn', 'Vinecorn', 'cutter', 340, 210000, 1200000, 'godly'),
    'fire_pod': PlantSpecies('fire_pod', 'Fire Pod', 'cutter', 500, 280000, 1800000, 'godly'),
    'shadow_bean': PlantSpecies('shadow_bean', 'Shadow Bean', 'picker', 420, 320000, 3182000, 'godly'),
    'prism_stalk': PlantSpecies('prism_stalk', 'Prism Stalk', 'picker', 670, 340000, 5620000, 'godly')
}

# Rarity spawn chances and quantity ranges - VERY LIMITED STOCK
RARITY_CONFIG = {
    'common': {'spawn_chance': 0.50, 'min_qty': 2, 'max_qty': 5},        # 50% chance, 2-5 stock
    'uncommon': {'spawn_chance': 0.35, 'min_qty': 1, 'max_qty': 4},     # 35% chance, 1-4 stock
    'rare': {'spawn_chance': 0.20, 'min_qty': 1, 'max_qty': 3},         # 20% chance, 1-3 stock  
    'legendary': {'spawn_chance': 0.10, 'min_qty': 1, 'max_qty': 2},    # 10% chance, 1-2 stock
    'mythical': {'spawn_chance': 0.05, 'min_qty': 1, 'max_qty': 2},     # 5% chance, 1-2 stock
    'ultra_mythical': {'spawn_chance': 0.02, 'min_qty': 1, 'max_qty': 1}, # 2% chance, 1 stock only
    'godly': {'spawn_chance': 0.008, 'min_qty': 1, 'max_qty': 1}        # 0.8% chance, 1 stock only
}

# Global game instance
game_state = None

def initialize_game():
    """Initialize the game state"""
    global game_state
    game_state = GameState()
    return game_state

def get_game_state():
    """Get current game state"""
    global game_state
    if game_state is None:
        game_state = initialize_game()
    return game_state

# Web API endpoints (for JavaScript integration)
def get_shop_data():
    """Get current shop data for frontend"""
    state = get_game_state()
    
    # Check if shop needs refresh
    current_time = time.time()
    if current_time >= state.shop.refresh_at:
        state.shop.refresh_shop()
    
    return {
        'slots': [
            {
                'species_id': slot.species_id,
                'species_name': PLANT_SPECIES[slot.species_id].name,
                'species_type': PLANT_SPECIES[slot.species_id].type,
                'rarity': PLANT_SPECIES[slot.species_id].rarity,
                'stock': slot.stock,
                'price': slot.base_price * (1.1 if slot.purchases_this_roll == 1 else 1.25 if slot.purchases_this_roll > 1 else 1.0),
                'base_price': slot.base_price,
                'purchases': slot.purchases_this_roll,
                'grow_time': PLANT_SPECIES[slot.species_id].grow_time,
                'base_sell': PLANT_SPECIES[slot.species_id].base_sell
            } for slot in state.shop.slots
        ],
        'refresh_at': state.shop.refresh_at,
        'time_until_refresh': max(0, state.shop.refresh_at - time.time())
    }

def get_pots_data():
    """Get current pots data for frontend"""
    state = get_game_state()
    state.update_plants()
    
    pots_data = []
    for pot in state.pots:
        pot_data = {
            'index': pot.index,
            'state': pot.state,
            'instance_id': pot.instance_id
        }
        
        if pot.instance_id and pot.instance_id in state.plant_instances:
            instance = state.plant_instances[pot.instance_id]
            species = PLANT_SPECIES[instance.species_id]
            multipliers = state.get_plant_level_multipliers(pot.instance_id)
            required_xp = state.get_experience_required_for_level(instance.level + 1, instance.species_id)
            
            pot_data.update({
                'species_name': species.name,
                'species_type': species.type,
                'planted_at': instance.planted_at,
                'picks_done': instance.picks_done,
                'rarity': instance.rarity,
                'ready_state': instance.ready_state,
                'grow_time': species.grow_time,
                'level': instance.level,
                'experience': instance.experience,
                'required_xp': required_xp,
                'clipper_unlocked': getattr(instance, 'clipper_unlocked', False),
                'clipper_level': getattr(instance, 'clipper_level', 0),
                'clipper_experience': getattr(instance, 'clipper_experience', 0),
                'multipliers': multipliers
            })
        
        pots_data.append(pot_data)
    
    return pots_data

if __name__ == "__main__":
    # Initialize game for testing
    game = initialize_game()
    print("Game initialized successfully!")
    print(f"Starting coins: {game.coins}")
    print(f"Number of pots: {len(game.pots)}")
    print(f"Shop slots: {len(game.shop.slots)}")
