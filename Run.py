from flask import Flask, render_template, send_from_directory, jsonify, request
import os
import sys
sys.path.append('.')
from Setup import get_game_state, get_shop_data, get_pots_data, initialize_game

app = Flask(__name__, template_folder='.', static_folder='.')

# Initialize game on server start
initialize_game()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/Assets/<path:filename>')
def assets(filename):
    return send_from_directory('Assets', filename)

@app.route('/Sound/<path:filename>')
def sounds(filename):
    return send_from_directory('Sound', filename)

@app.route('/api/shop')
def api_shop():
    return jsonify(get_shop_data())

@app.route('/api/pots')
def api_pots():
    return jsonify(get_pots_data())

@app.route('/api/game-state')
def api_game_state():
    state = get_game_state()
    return jsonify({
        'coins': state.coins,
        'shop': get_shop_data(),
        'pots': get_pots_data()
    })

@app.route('/api/buy-seed', methods=['POST'])
def api_buy_seed():
    data = request.json
    slot_index = data.get('slot_index')
    pot_index = data.get('pot_index')
    
    print(f"🛒 DEBUG: Purchase request - slot_index: {slot_index}, pot_index: {pot_index}")
    
    state = get_game_state()
    print(f"💰 DEBUG: Player coins: {state.coins}")
    print(f"🏪 DEBUG: Shop has {len(state.shop.slots)} slots")
    
    if slot_index < len(state.shop.slots):
        slot = state.shop.slots[slot_index]
        print(f"📦 DEBUG: Slot {slot_index} - species: {slot.species_id}, stock: {slot.stock}, price: {slot.base_price}")
    else:
        print(f"❌ DEBUG: Invalid slot index {slot_index}")
    
    success = state.buy_seed(slot_index, pot_index)
    print(f"✅ DEBUG: Purchase result: {success}")
    
    return jsonify({
        'success': success,
        'coins': state.coins,
        'shop': get_shop_data(),
        'pots': get_pots_data()
    })

if __name__ == '__main__':
    print("Starting Grow A Beanstock game server...")
    print("Open your browser and go to: http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
