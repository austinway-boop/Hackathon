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

@app.route('/css/<path:filename>')
def css_files(filename):
    return send_from_directory('css', filename)

@app.route('/js/<path:filename>')
def js_files(filename):
    return send_from_directory('js', filename)

# Legacy routes for backwards compatibility
@app.route('/styles.css')
def styles():
    return send_from_directory('.', 'styles.css')

@app.route('/game.js')
def game_js():
    return send_from_directory('.', 'game.js')

@app.route('/api/shop')
def api_shop():
    return jsonify(get_shop_data())

@app.route('/api/pots')
def api_pots():
    return jsonify(get_pots_data())

@app.route('/api/game-state')
def api_game_state():
    state = get_game_state()
    
    # Reset clipper states on page load (clippers don't persist between sessions)
    # This is called when the page first loads
    state.reset_all_clipper_states()
    
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

@app.route('/api/add-clipper-experience', methods=['POST'])
def api_add_clipper_experience():
    print("✂️ DEBUG: Add clipper experience request received")
    data = request.json
    instance_id = data.get('instance_id')
    xp_amount = data.get('xp_amount', 0.5)
    
    if not instance_id:
        print("❌ DEBUG: Invalid instance_id:", instance_id)
        return jsonify({'success': False, 'message': 'Invalid instance ID'}), 400
    
    state = get_game_state()
    result = state.add_clipper_experience(instance_id, xp_amount)
    
    if result.get('leveled_up'):
        print(f"✂️ DEBUG: Clipper {instance_id} leveled up from {result['old_level']} to {result['new_level']}!")
    
    return jsonify({
        'success': True,
        'result': result,
        'pots': get_pots_data()
    })

@app.route('/api/add-plant-experience', methods=['POST'])
def api_add_plant_experience():
    print("⭐ DEBUG: Add plant experience request received")
    data = request.json
    instance_id = data.get('instance_id')
    xp_amount = data.get('xp_amount', 1)
    
    if not instance_id:
        print("❌ DEBUG: Invalid instance_id:", instance_id)
        return jsonify({'success': False, 'message': 'Invalid instance ID'}), 400
    
    state = get_game_state()
    result = state.add_plant_experience(instance_id, xp_amount)
    
    if result['leveled_up']:
        print(f"🎉 DEBUG: Plant {instance_id} leveled up from {result['old_level']} to {result['new_level']}!")
        if result.get('clipper_unlocked'):
            print(f"✂️ DEBUG: Clippers unlocked for plant {instance_id}!")
    
    return jsonify({
        'success': True,
        'result': result,
        'pots': get_pots_data()
    })

@app.route('/api/plant-from-inventory', methods=['POST'])
def api_plant_from_inventory():
    print("🌱 DEBUG: Plant from inventory request received")
    data = request.json
    species_name = data.get('species_name')
    pot_index = data.get('pot_index')
    
    if not species_name or pot_index is None:
        print(f"❌ DEBUG: Invalid data - species_name: {species_name}, pot_index: {pot_index}")
        return jsonify({'success': False, 'message': 'Invalid species name or pot index'}), 400
    
    state = get_game_state()
    
    # Validate pot index and check if pot is available
    if pot_index >= len(state.pots):
        print(f"❌ DEBUG: Pot index {pot_index} out of range, have {len(state.pots)} pots")
        return jsonify({'success': False, 'message': 'Pot index out of range'}), 400
    
    pot = state.pots[pot_index]
    if pot.state != 'empty':
        print(f"❌ DEBUG: Pot {pot_index} is not empty, state: {pot.state}")
        return jsonify({'success': False, 'message': 'Pot is not available for planting'}), 400
    
    # Find the species in the plant species
    from Setup import PLANT_SPECIES, PlantInstance
    species_id = None
    for sid, species in PLANT_SPECIES.items():
        if species.name == species_name:
            species_id = sid
            break
    
    if not species_id:
        print(f"❌ DEBUG: Species '{species_name}' not found")
        return jsonify({'success': False, 'message': 'Species not found'}), 400
    
    # Create plant instance
    instance_id = f"plant_{time.time()}_{pot_index}"
    rarity = state.generate_rarity()
    instance = state.plant_instances[instance_id] = PlantInstance(species_id, time.time(), rarity)
    
    # Plant in pot
    pot.instance_id = instance_id
    pot.state = 'growing'
    
    print(f"🌱 DEBUG: Successfully planted {species_name} (instance_id: {instance_id}) in pot {pot_index}")
    
    return jsonify({
        'success': True,
        'instance_id': instance_id,
        'pots': get_pots_data()
    })

def console_command_listener():
    """Listen for console commands in a separate thread"""
    print("\n🎮 Console Commands Available:")
    print("   Startslot  - Launch the slot machine mini-game")
    print("   Level24    - Level up all plants to level 24 (one away from clippers)")
    print("   Level25    - Level up to 25 (unlocks clippers, 3x money)")
    print("   Level50    - Level up to 50 (4x money multiplier)")
    print("   Level100   - Level up to 100 (5.5x money multiplier)")
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
                
                elif command == "level24":
                    print("⚡ DEBUG: Leveling up all plants to level 24...")
                    try:
                        from Setup import get_game_state
                        state = get_game_state()
                        
                        # Level up all existing plant instances to level 24
                        for instance_id, plant in state.plant_instances.items():
                            plant.level = 24
                            plant.experience = 0  # Reset XP to 0 at new level
                            plant.clipper_unlocked = False  # Not unlocked yet
                            plant.clipper_level = 0
                            plant.clipper_experience = 0
                            
                            # Calculate proper XP requirement for level 25
                            species_id = plant.species_id
                            required_xp = state.get_experience_required_for_level(25, species_id)
                            print(f"   ✅ Leveled up plant {instance_id} to level 24 (needs {required_xp} XP for level 25)")
                        
                        # Update all pots to reflect the new levels
                        for pot in state.pots:
                            if pot.instance_id and pot.instance_id in state.plant_instances:
                                plant = state.plant_instances[pot.instance_id]
                                pot.level = 24
                                pot.experience = 0
                                # Use the proper XP calculation from the game's formula
                                pot.required_xp = state.get_experience_required_for_level(25, plant.species_id)
                                pot.clipper_unlocked = False
                                pot.clipper_level = 0
                                print(f"   ✅ Updated pot {pot.instance_id} to level 24 (needs {pot.required_xp} XP for level 25)")
                        
                        print("🎉 All plants have been leveled up to level 24!")
                        print("   Collect a few beans to reach level 25 and unlock auto-clippers!")
                        
                    except Exception as e:
                        print(f"❌ Error leveling up plants: {e}")
                
                elif command == "level25":
                    print("⚡ DEBUG: Leveling up all plants to level 25 with clippers...")
                    try:
                        from Setup import get_game_state
                        state = get_game_state()
                        
                        # Level up all existing plant instances to level 25
                        for instance_id, plant in state.plant_instances.items():
                            plant.level = 25
                            plant.experience = 0
                            plant.clipper_unlocked = True  # Clippers unlocked!
                            plant.clipper_level = 1
                            plant.clipper_experience = 0
                            
                            print(f"   ✅ Leveled up plant {instance_id} to level 25 with clippers!")
                        
                        # Update all pots to reflect the new levels
                        for pot in state.pots:
                            if pot.instance_id and pot.instance_id in state.plant_instances:
                                plant = state.plant_instances[pot.instance_id]
                                pot.level = 25
                                pot.experience = 0
                                pot.required_xp = state.get_experience_required_for_level(26, plant.species_id)
                                pot.clipper_unlocked = True
                                pot.clipper_level = 1
                                print(f"   ✅ Updated pot {pot.instance_id} to level 25 with clippers!")
                        
                        print("🎉 All plants have been leveled up to level 25!")
                        print("✂️  Auto-clippers are now active!")
                        print("💰 Money multiplier: 3x (balanced scaling)")
                        
                    except Exception as e:
                        print(f"❌ Error leveling up plants: {e}")
                
                elif command == "level50":
                    print("🔥 Leveling up all plants to level 50...")
                    try:
                        from Setup import get_game_state
                        state = get_game_state()
                        
                        for instance_id, plant in state.plant_instances.items():
                            plant.level = 50
                            plant.experience = 0
                            plant.clipper_unlocked = True
                            plant.clipper_level = 5
                            plant.clipper_experience = 0
                            print(f"   ✅ Plant {instance_id} at level 50!")
                        
                        print("🔥 Level 50 ACTIVATED!")
                        print("💰 Money multiplier: 4x")
                        print("⚡ Spawn rate: 2x faster")
                        
                    except Exception as e:
                        print(f"❌ Error: {e}")
                
                elif command == "level100":
                    print("⚡ Leveling up all plants to level 100...")
                    try:
                        from Setup import get_game_state
                        state = get_game_state()
                        
                        for instance_id, plant in state.plant_instances.items():
                            plant.level = 100
                            plant.experience = 0
                            plant.clipper_unlocked = True
                            plant.clipper_level = 10
                            plant.clipper_experience = 0
                            print(f"   ✅ Plant {instance_id} at level 100!")
                        
                        print("⚡ Level 100 ACTIVATED!")
                        print("💰 Money multiplier: 5.5x")
                        print("⚡ Spawn rate: 3x faster")
                        print("🌟 Solid progression!")
                        
                    except Exception as e:
                        print(f"❌ Error: {e}")
                
                elif command == "help":
                    print("\n🎮 Available Commands:")
                    print("   startslot  - Launch the slot machine mini-game")
                    print("   level24    - Level up to 24 (one away from clippers)")
                    print("   level25    - Level up to 25 (unlocks clippers, 3x money)")
                    print("   level50    - Level up to 50 (4x money)")
                    print("   level100   - Level up to 100 (5.5x money)")
                    print("   help       - Show this help message")
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
