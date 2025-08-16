# 🌱 Grow A Beanstock

A web-based plant growing idle game built with Flask and JavaScript.

## Quick Start

1. Create and activate virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install Flask:
   ```bash
   pip install flask
   ```

3. Run the game server:
   ```bash
   python Run.py
   ```

4. Open your browser and go to: `http://localhost:5000`

5. Click "Start Growing!" to begin playing

## Features Implemented

- ✅ Start screen with fullscreen mode
- ✅ Beautiful background with moving clouds
- ✅ Grass terrain with 12 plant pots
- ✅ Core game architecture with Flask backend
- ✅ Plant species system (6 species ready)
- ✅ Shop system with seed purchasing
- ✅ Growth timers and plant lifecycle
- ✅ Rarity system (size & finish multipliers)
- ✅ Visual pot state indicators

## Game Mechanics

- **Shop**: Refreshes every 5 minutes with 6 seed types
- **Planting**: Click empty pots to plant seeds (shop integration coming)
- **Growth**: Plants grow in 60-300 seconds depending on species  
- **Harvest**: Click ready pots to harvest (harvest system coming)
- **Economy**: Starting coins: 100, seed costs: 10-40 coins

## Next Steps

The foundation is complete! Ready to add:
- Shop UI overlay
- Harvest/picking mechanics  
- Coin display and transactions
- Growth progress indicators
- Offline progression handling

## Technical Architecture

- **Run.py**: Flask web server with API endpoints
- **Setup.py**: Core game logic and data structures
- **index.html**: Frontend with game visuals and interactions
- **Assets/**: Game sprites (background, grass, pots, clouds)
