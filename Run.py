from flask import Flask, render_template, send_from_directory, jsonify, request
import os
import sys
import threading
import time
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

@app.route('/api/update-money', methods=['POST'])
def api_update_money():
    print("💰 DEBUG: Money update request received")
    data = request.json
    new_coins = data.get('coins')
    
    if new_coins is None or new_coins < 0:
        print("❌ DEBUG: Invalid coins value:", new_coins)
        return jsonify({'success': False, 'message': 'Invalid coins value'}), 400
    
    state = get_game_state()
    old_coins = state.coins
    state.coins = new_coins
    
    print(f"💰 DEBUG: Money updated - {old_coins} → {new_coins}")
    
    return jsonify({
        'success': True,
        'coins': state.coins,
        'message': f'Money updated to {state.coins}'
    })

@app.route('/api/burn-plant', methods=['POST'])
def api_burn_plant():
    print("🔥 DEBUG: Burn plant request received")
    data = request.json
    pot_index = data.get('pot_index')
    
    if pot_index is None or pot_index < 0:
        print("❌ DEBUG: Invalid pot_index value:", pot_index)
        return jsonify({'success': False, 'message': 'Invalid pot index'}), 400
    
    state = get_game_state()
    
    # Validate pot index
    if pot_index >= len(state.pots):
        print(f"❌ DEBUG: Pot index {pot_index} out of range, have {len(state.pots)} pots")
        return jsonify({'success': False, 'message': 'Pot index out of range'}), 400
    
    pot = state.pots[pot_index]
    
    # Check if pot has a plant to burn
    if pot.state == 'empty':
        print(f"❌ DEBUG: Pot {pot_index} is already empty")
        return jsonify({'success': False, 'message': 'Pot is already empty'}), 400
    
    # Remove plant instance if it exists
    if pot.instance_id and pot.instance_id in state.plant_instances:
        del state.plant_instances[pot.instance_id]
        print(f"🔥 DEBUG: Removed plant instance {pot.instance_id}")
    
    # Clear pot
    pot.instance_id = None
    pot.state = 'empty'
    
    print(f"🔥 DEBUG: Burned plant in pot {pot_index}, pot is now empty")
    
    return jsonify({
        'success': True,
        'message': f'Plant burned in pot {pot_index}',
        'pots': get_pots_data()
    })

def console_command_listener():
    """Listen for console commands in a separate thread"""
    print("\n🎮 Console Commands Available:")
    print("   Startslot - Launch the slot machine mini-game")
    print("   Type commands below (press Ctrl+C to stop server)\n")
    
    try:
        while True:
            try:
                command = input("").strip().lower()
                
                if command == "startslot":
                    print("🎰 Starting Slot Machine Mini-Game...")
                    try:
                        # Import and start slot machine in a separate thread
                        from SlotMachine import start_slot_machine
                        slot_thread = threading.Thread(target=start_slot_machine, daemon=True)
                        slot_thread.start()
                    except ImportError as e:
                        print(f"❌ Error: Could not import slot machine: {e}")
                    except Exception as e:
                        print(f"❌ Error starting slot machine: {e}")
                
                elif command == "help":
                    print("\n🎮 Available Commands:")
                    print("   startslot - Launch the slot machine mini-game")
                    print("   help      - Show this help message")
                    print("")
                
                elif command != "":
                    print(f"❌ Unknown command: '{command}'. Type 'help' for available commands.")
                    
            except EOFError:
                # Handle Ctrl+D
                break
            except KeyboardInterrupt:
                # Handle Ctrl+C
                break
                
    except Exception as e:
        print(f"Console listener error: {e}")

def find_available_port(start_port=5001, max_attempts=10):
    """Find an available port starting from start_port"""
    import socket
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('0.0.0.0', port))
                return port
        except OSError:
            continue
    return None

if __name__ == '__main__':
    print("Starting Grow A Beanstock game server...")
    
    # Use port 5000 specifically to match JavaScript expectations
    port = 5000
    
    # Check if port 5000 is available
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('0.0.0.0', port))
    except OSError:
        print("❌ Port 5000 is already in use. Trying to find alternative...")
        port = find_available_port(5001)
        if not port:
            print("❌ Could not find an available port. Please check what's using ports 5000-5010 and stop those processes.")
            import sys
            sys.exit(1)
    
    print(f"🚀 Server starting on: http://localhost:{port}")
    print(f"🌱 Open your browser and go to: http://localhost:{port}")
    
    # Start console command listener in a separate thread
    console_thread = threading.Thread(target=console_command_listener, daemon=True)
    console_thread.start()
    
    # Start Flask server
    app.run(debug=False, host='0.0.0.0', port=port, use_reloader=False)
