from flask import Flask, render_template, send_from_directory, jsonify, request
import os
import sys
import json

# Add the parent directory to the path so we can import Setup
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

try:
    from Setup import get_game_state, get_shop_data, get_pots_data, initialize_game
except ImportError as e:
    print(f"Import error: {e}")
    # Fallback imports or error handling
    def get_game_state():
        return {"coins": 120, "pots": []}
    def get_shop_data():
        return {
            "slots": [
                {"species_id": "beanstalk", "species_name": "Beanstalk", "species_type": "picker", "rarity": "common", "stock": 8, "price": 120, "base_price": 120, "purchases": 0, "grow_time": 25, "base_sell": 14},
                {"species_id": "snap_pea", "species_name": "Snap Pea", "species_type": "picker", "rarity": "common", "stock": 7, "price": 560, "base_price": 560, "purchases": 0, "grow_time": 75, "base_sell": 90},
                {"species_id": "jellybean_vine", "species_name": "Jellybean Vine", "species_type": "picker", "rarity": "uncommon", "stock": 6, "price": 1285, "base_price": 1285, "purchases": 0, "grow_time": 90, "base_sell": 170},
                {"species_id": "bamboo_bean", "species_name": "Bamboo-Bean", "species_type": "cutter", "rarity": "uncommon", "stock": 6, "price": 5410, "base_price": 5410, "purchases": 0, "grow_time": 120, "base_sell": 300},
                {"species_id": "coffee_beanstalk", "species_name": "Coffee Beanstalk", "species_type": "picker", "rarity": "uncommon", "stock": 5, "price": 9300, "base_price": 9300, "purchases": 0, "grow_time": 120, "base_sell": 540},
                {"species_id": "thunder_pod", "species_name": "Thunder Pod", "species_type": "cutter", "rarity": "rare", "stock": 4, "price": 17000, "base_price": 17000, "purchases": 0, "grow_time": 150, "base_sell": 970},
                {"species_id": "frost_pea", "species_name": "Frost Pea", "species_type": "picker", "rarity": "rare", "stock": 3, "price": 31000, "base_price": 31000, "purchases": 0, "grow_time": 150, "base_sell": 2700},
                {"species_id": "choco_vine", "species_name": "Choco Vine", "species_type": "picker", "rarity": "rare", "stock": 2, "price": 35200, "base_price": 35200, "purchases": 0, "grow_time": 180, "base_sell": 3500},
                {"species_id": "ironvine", "species_name": "Ironvine", "species_type": "cutter", "rarity": "legendary", "stock": 7, "price": 90000, "base_price": 90000, "purchases": 0, "grow_time": 210, "base_sell": 15300},
                {"species_id": "honeyvine", "species_name": "Honeyvine", "species_type": "picker", "rarity": "legendary", "stock": 6, "price": 180000, "base_price": 180000, "purchases": 0, "grow_time": 180, "base_sell": 19300},
                {"species_id": "sunbean", "species_name": "Sunbean", "species_type": "picker", "rarity": "legendary", "stock": 5, "price": 193000, "base_price": 193000, "purchases": 0, "grow_time": 240, "base_sell": 25500},
                {"species_id": "moonbean", "species_name": "Moonbean", "species_type": "picker", "rarity": "mythical", "stock": 4, "price": 253000, "base_price": 253000, "purchases": 0, "grow_time": 240, "base_sell": 43000},
                {"species_id": "cloud_creeper", "species_name": "Cloud Creeper", "species_type": "picker", "rarity": "mythical", "stock": 3, "price": 295000, "base_price": 295000, "purchases": 0, "grow_time": 270, "base_sell": 49000},
                {"species_id": "royal_stalk", "species_name": "Royal Stalk", "species_type": "cutter", "rarity": "ultra-mythical", "stock": 2, "price": 465000, "base_price": 465000, "purchases": 0, "grow_time": 300, "base_sell": 86000},
                {"species_id": "crystal_bean", "species_name": "Crystal Bean", "species_type": "picker", "rarity": "ultra-mythical", "stock": 1, "price": 600000, "base_price": 600000, "purchases": 0, "grow_time": 300, "base_sell": 120000},
                {"species_id": "neon_soy", "species_name": "Neon Soy", "species_type": "cutter", "rarity": "ultra-mythical", "stock": 5, "price": 570000, "base_price": 570000, "purchases": 0, "grow_time": 330, "base_sell": 160000},
                {"species_id": "vinecorn", "species_name": "Vinecorn", "species_type": "cutter", "rarity": "godly", "stock": 4, "price": 1200000, "base_price": 1200000, "purchases": 0, "grow_time": 240, "base_sell": 210000},
                {"species_id": "fire_pod", "species_name": "Fire Pod", "species_type": "cutter", "rarity": "godly", "stock": 3, "price": 1800000, "base_price": 1800000, "purchases": 0, "grow_time": 360, "base_sell": 280000},
                {"species_id": "shadow_bean", "species_name": "Shadow Bean", "species_type": "picker", "rarity": "godly", "stock": 2, "price": 3182000, "base_price": 3182000, "purchases": 0, "grow_time": 300, "base_sell": 320000},
                {"species_id": "prism_stalk", "species_name": "Prism Stalk", "species_type": "picker", "rarity": "godly", "stock": 1, "price": 5620000, "base_price": 5620000, "purchases": 0, "grow_time": 480, "base_sell": 340000}
            ],
            "refresh_at": 0
        }
    def get_pots_data():
        return []
    def initialize_game():
        pass

app = Flask(__name__)

# Initialize game on server start
try:
    initialize_game()
except Exception as e:
    print(f"Game initialization error: {e}")

@app.route('/')
def index():
    # Read and return the HTML file content
    try:
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'index.html'), 'r') as f:
            return f.read()
    except Exception as e:
        return f"Error loading index.html: {e}"

@app.route('/api/shop')
def api_shop():
    try:
        return jsonify(get_shop_data())
    except Exception as e:
        # Return fallback data with correct prices
        return jsonify({
            "slots": [
                {"species_id": "beanstalk", "species_name": "Beanstalk", "species_type": "picker", "rarity": "common", "stock": 8, "price": 120, "base_price": 120, "purchases": 0, "grow_time": 25, "base_sell": 14},
                {"species_id": "snap_pea", "species_name": "Snap Pea", "species_type": "picker", "rarity": "common", "stock": 7, "price": 560, "base_price": 560, "purchases": 0, "grow_time": 75, "base_sell": 90},
                {"species_id": "jellybean_vine", "species_name": "Jellybean Vine", "species_type": "picker", "rarity": "uncommon", "stock": 6, "price": 1285, "base_price": 1285, "purchases": 0, "grow_time": 90, "base_sell": 170},
                {"species_id": "bamboo_bean", "species_name": "Bamboo-Bean", "species_type": "cutter", "rarity": "uncommon", "stock": 6, "price": 5410, "base_price": 5410, "purchases": 0, "grow_time": 120, "base_sell": 300},
                {"species_id": "coffee_beanstalk", "species_name": "Coffee Beanstalk", "species_type": "picker", "rarity": "uncommon", "stock": 5, "price": 9300, "base_price": 9300, "purchases": 0, "grow_time": 120, "base_sell": 540},
                {"species_id": "thunder_pod", "species_name": "Thunder Pod", "species_type": "cutter", "rarity": "rare", "stock": 4, "price": 17000, "base_price": 17000, "purchases": 0, "grow_time": 150, "base_sell": 970},
                {"species_id": "frost_pea", "species_name": "Frost Pea", "species_type": "picker", "rarity": "rare", "stock": 3, "price": 31000, "base_price": 31000, "purchases": 0, "grow_time": 150, "base_sell": 2700},
                {"species_id": "choco_vine", "species_name": "Choco Vine", "species_type": "picker", "rarity": "rare", "stock": 2, "price": 35200, "base_price": 35200, "purchases": 0, "grow_time": 180, "base_sell": 3500},
                {"species_id": "ironvine", "species_name": "Ironvine", "species_type": "cutter", "rarity": "legendary", "stock": 7, "price": 90000, "base_price": 90000, "purchases": 0, "grow_time": 210, "base_sell": 15300},
                {"species_id": "honeyvine", "species_name": "Honeyvine", "species_type": "picker", "rarity": "legendary", "stock": 6, "price": 180000, "base_price": 180000, "purchases": 0, "grow_time": 180, "base_sell": 19300},
                {"species_id": "sunbean", "species_name": "Sunbean", "species_type": "picker", "rarity": "legendary", "stock": 5, "price": 193000, "base_price": 193000, "purchases": 0, "grow_time": 240, "base_sell": 25500},
                {"species_id": "moonbean", "species_name": "Moonbean", "species_type": "picker", "rarity": "mythical", "stock": 4, "price": 253000, "base_price": 253000, "purchases": 0, "grow_time": 240, "base_sell": 43000},
                {"species_id": "cloud_creeper", "species_name": "Cloud Creeper", "species_type": "picker", "rarity": "mythical", "stock": 3, "price": 295000, "base_price": 295000, "purchases": 0, "grow_time": 270, "base_sell": 49000},
                {"species_id": "royal_stalk", "species_name": "Royal Stalk", "species_type": "cutter", "rarity": "ultra-mythical", "stock": 2, "price": 465000, "base_price": 465000, "purchases": 0, "grow_time": 300, "base_sell": 86000},
                {"species_id": "crystal_bean", "species_name": "Crystal Bean", "species_type": "picker", "rarity": "ultra-mythical", "stock": 1, "price": 600000, "base_price": 600000, "purchases": 0, "grow_time": 300, "base_sell": 120000},
                {"species_id": "neon_soy", "species_name": "Neon Soy", "species_type": "cutter", "rarity": "ultra-mythical", "stock": 5, "price": 570000, "base_price": 570000, "purchases": 0, "grow_time": 330, "base_sell": 160000},
                {"species_id": "vinecorn", "species_name": "Vinecorn", "species_type": "cutter", "rarity": "godly", "stock": 4, "price": 1200000, "base_price": 1200000, "purchases": 0, "grow_time": 240, "base_sell": 210000},
                {"species_id": "fire_pod", "species_name": "Fire Pod", "species_type": "cutter", "rarity": "godly", "stock": 3, "price": 1800000, "base_price": 1800000, "purchases": 0, "grow_time": 360, "base_sell": 280000},
                {"species_id": "shadow_bean", "species_name": "Shadow Bean", "species_type": "picker", "rarity": "godly", "stock": 2, "price": 3182000, "base_price": 3182000, "purchases": 0, "grow_time": 300, "base_sell": 320000},
                {"species_id": "prism_stalk", "species_name": "Prism Stalk", "species_type": "picker", "rarity": "godly", "stock": 1, "price": 5620000, "base_price": 5620000, "purchases": 0, "grow_time": 480, "base_sell": 340000}
            ],
            "refresh_at": 0,
            "error": str(e)
        })

@app.route('/api/pots')
def api_pots():
    try:
        return jsonify(get_pots_data())
    except Exception as e:
        return jsonify({"error": str(e), "pots": []})

@app.route('/api/game-state')
def api_game_state():
    try:
        state = get_game_state()
        return jsonify({
            "coins": getattr(state, 'coins', 120),
            "pots": getattr(state, 'pots', [])
        })
    except Exception as e:
        return jsonify({"error": str(e), "coins": 120, "pots": []})

# For Vercel
def handler(request):
    return app(request.environ, lambda *args: None)

if __name__ == '__main__':
    app.run(debug=True)
