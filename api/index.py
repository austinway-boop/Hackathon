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
                {"species_id": "beanstalk", "species_name": "Beanstalk", "species_type": "picker", "rarity": "common", "stock": 3, "price": 120, "base_price": 120, "purchases": 0, "grow_time": 25, "base_sell": 14},
                {"species_id": "snap_pea", "species_name": "Snap Pea", "species_type": "picker", "rarity": "common", "stock": 4, "price": 560, "base_price": 560, "purchases": 0, "grow_time": 75, "base_sell": 90},
                {"species_id": "jellybean_vine", "species_name": "Jellybean Vine", "species_type": "picker", "rarity": "uncommon", "stock": 2, "price": 1285, "base_price": 1285, "purchases": 0, "grow_time": 90, "base_sell": 170},
                {"species_id": "bamboo_bean", "species_name": "Bamboo-Bean", "species_type": "cutter", "rarity": "uncommon", "stock": 2, "price": 5410, "base_price": 5410, "purchases": 0, "grow_time": 120, "base_sell": 300},
                {"species_id": "coffee_beanstalk", "species_name": "Coffee Beanstalk", "species_type": "picker", "rarity": "uncommon", "stock": 3, "price": 9300, "base_price": 9300, "purchases": 0, "grow_time": 120, "base_sell": 540},
                {"species_id": "thunder_pod", "species_name": "Thunder Pod", "species_type": "cutter", "rarity": "rare", "stock": 1, "price": 17000, "base_price": 17000, "purchases": 0, "grow_time": 150, "base_sell": 970},
                {"species_id": "frost_pea", "species_name": "Frost Pea", "species_type": "picker", "rarity": "rare", "stock": 1, "price": 31000, "base_price": 31000, "purchases": 0, "grow_time": 150, "base_sell": 2700}
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
                {"species_id": "beanstalk", "species_name": "Beanstalk", "species_type": "picker", "rarity": "common", "stock": 3, "price": 120, "base_price": 120, "purchases": 0, "grow_time": 25, "base_sell": 14},
                {"species_id": "snap_pea", "species_name": "Snap Pea", "species_type": "picker", "rarity": "common", "stock": 4, "price": 560, "base_price": 560, "purchases": 0, "grow_time": 75, "base_sell": 90},
                {"species_id": "jellybean_vine", "species_name": "Jellybean Vine", "species_type": "picker", "rarity": "uncommon", "stock": 2, "price": 1285, "base_price": 1285, "purchases": 0, "grow_time": 90, "base_sell": 170},
                {"species_id": "bamboo_bean", "species_name": "Bamboo-Bean", "species_type": "cutter", "rarity": "uncommon", "stock": 2, "price": 5410, "base_price": 5410, "purchases": 0, "grow_time": 120, "base_sell": 300},
                {"species_id": "coffee_beanstalk", "species_name": "Coffee Beanstalk", "species_type": "picker", "rarity": "uncommon", "stock": 3, "price": 9300, "base_price": 9300, "purchases": 0, "grow_time": 120, "base_sell": 540}
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
