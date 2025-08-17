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
        return {"slots": [], "refresh_at": 0}
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
        return jsonify({"error": str(e), "slots": [], "refresh_at": 0})

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
