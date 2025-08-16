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
    def __init__(self, id: str, name: str, type: str, grow_time: int, base_sell: int, seed_cost: int):
        self.id = id
        self.name = name
        self.type = type  # 'picker' or 'cutter'
        self.grow_time = grow_time  # seconds to first ready
        self.base_sell = base_sell
        self.seed_cost = seed_cost

class PlantInstance:
    """Represents a specific planted seed with its characteristics"""
    def __init__(self, species_id: str, planted_at: float, rarity: Dict[str, str]):
        self.species_id = species_id
        self.planted_at = planted_at
        self.picks_done = 0
        self.rarity = rarity  # {'size': 'normal'|'large'|'massive', 'finish': 'none'|'shiny'|'golden'}
        self.ready_state = 'growing'  # 'growing'|'ready'|'harvested'

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
        self.refresh_at = time.time() + 300  # 5 minutes from now
        self.slots: List[ShopSlot] = []
        self.refresh_shop()

    def refresh_shop(self):
        """Refresh shop with new seeds"""
        self.slots = []
        species_pool = list(PLANT_SPECIES.keys())
        
        # Create 6 random slots
        import random
        for _ in range(6):
            species_id = random.choice(species_pool)
            species = PLANT_SPECIES[species_id]
            slot = ShopSlot(species_id, 3, species.seed_cost)
            self.slots.append(slot)
        
        self.refresh_at = time.time() + 300  # Next refresh in 5 minutes

class GameState:
    """Main game state manager"""
    def __init__(self):
        self.coins = 100  # Starting coins
        self.pots: List[Pot] = [Pot(i) for i in range(12)]
        self.plant_instances: Dict[str, PlantInstance] = {}
        self.shop = Shop()
        self.last_save = time.time()

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
        
        # Finish rarity: None 95%, Shiny 3%, Golden 2%
        finish_roll = random.random()
        if finish_roll < 0.95:
            finish = 'none'
        elif finish_roll < 0.98:
            finish = 'shiny'
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
            multiplier *= 1.5
        elif rarity['finish'] == 'golden':
            multiplier *= 2.0
        
        return multiplier

    def buy_seed(self, slot_index: int, pot_index: int) -> bool:
        """Buy a seed and plant it in a pot"""
        if slot_index >= len(self.shop.slots):
            return False
        
        slot = self.shop.slots[slot_index]
        if slot.stock <= 0:
            return False
        
        pot = self.pots[pot_index]
        if pot.state != 'empty':
            return False
        
        # Calculate price with repeat purchase tax
        price = slot.base_price
        if slot.purchases_this_roll > 0:
            if slot.purchases_this_roll == 1:
                price = int(price * 1.1)  # +10%
            else:
                price = int(price * 1.25)  # +25%
        
        if self.coins < price:
            return False
        
        # Deduct coins and update slot
        self.coins -= price
        slot.stock -= 1
        slot.purchases_this_roll += 1
        
        # Create plant instance with rarity
        instance_id = f"plant_{time.time()}_{pot_index}"
        rarity = self.generate_rarity()
        instance = PlantInstance(slot.species_id, time.time(), rarity)
        
        # Plant in pot
        self.plant_instances[instance_id] = instance
        pot.instance_id = instance_id
        pot.state = 'growing'
        
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
                    'ready_state': v.ready_state
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

# Plant species definitions (MVP 6 species as per PRD)
PLANT_SPECIES = {
    'beanstalk': PlantSpecies('beanstalk', 'Beanstalk', 'picker', 60, 14, 10),
    'snap_pea': PlantSpecies('snap_pea', 'Snap Pea', 'picker', 75, 18, 12),
    'jellybean_vine': PlantSpecies('jellybean_vine', 'Jellybean Vine', 'picker', 90, 22, 15),
    'bamboo_bean': PlantSpecies('bamboo_bean', 'Bamboo-Bean', 'cutter', 120, 34, 20),
    'coffee_creeper': PlantSpecies('coffee_creeper', 'Coffee Creeper', 'picker', 120, 45, 28),
    'thunder_pod': PlantSpecies('thunder_pod', 'Thunder Pod', 'cutter', 150, 70, 40)
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
    return {
        'slots': [
            {
                'species_id': slot.species_id,
                'species_name': PLANT_SPECIES[slot.species_id].name,
                'stock': slot.stock,
                'price': slot.base_price * (1.1 if slot.purchases_this_roll == 1 else 1.25 if slot.purchases_this_roll > 1 else 1.0),
                'base_price': slot.base_price,
                'purchases': slot.purchases_this_roll
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
            pot_data.update({
                'species_name': species.name,
                'species_type': species.type,
                'planted_at': instance.planted_at,
                'picks_done': instance.picks_done,
                'rarity': instance.rarity,
                'ready_state': instance.ready_state,
                'grow_time': species.grow_time
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
