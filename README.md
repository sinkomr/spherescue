# Tetrisphere Emulator

A comprehensive, browser-based emulation of the classic N64 puzzle game Tetrisphere. This project faithfully recreates the unique spherical puzzle mechanics, layer-based progression, and addictive match-and-drop gameplay of the original.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Status](https://img.shields.io/badge/status-playable-green)
![Platform](https://img.shields.io/badge/platform-web-orange)

## Overview

Tetrisphere is unlike traditional Tetris - instead of falling blocks, you manipulate a sphere made of different block types. Your goal is to match 3 or more adjacent blocks of the same type to eliminate them, drilling deeper into the sphere's layers until you reach the core.

## Features

### Core Gameplay Mechanics

- **Multi-Layer Sphere Structure** - 5-12 concentric layers (depending on difficulty) that you progressively drill through
- **Three Block Types** - Squares, Circles, and Triangles, each with distinct visual appearance
- **Match-3 System** - Select and drop groups of 3+ matching adjacent blocks
- **Flood-Fill Selection** - Intelligent selection of all connected matching blocks
- **Grid-Based Cursor** - Navigate the sphere surface with WASD controls
- **Layer Visibility** - Current layer is opaque, next layer is semi-transparent for strategic planning

### Advanced Mechanics

- **Gravity System** - Blocks from inner layers fall outward when blocks below are removed
- **Cascade Chains** - Chain reactions when falling blocks create new matches
- **Combo Multiplier** - Score multipliers for consecutive automatic matches
- **Power-Ups**:
  - **Bombs** - Destroy all blocks within a radius
  - **Wildcards** - Match with any block type (octahedron shape)
- **Slide Mechanic** - Horizontal block movement (Q/E keys)

### Progression & Difficulty

- **Three Difficulty Levels**:
  - **Easy**: 5 layers, 8 blocks per layer, 15% power-up chance
  - **Medium**: 8 layers, 12 blocks per layer, 10% power-up chance
  - **Hard**: 12 layers, 16 blocks per layer, 5% power-up chance
- **Level Progression** - Complete all layers to advance to next level
- **Progressive Difficulty** - Each level increases challenge
- **Core Progress Bar** - Visual indicator of depth progression

### Visual & Audio

- **3D Graphics** - Full 3D rendering with Three.js
- **Dynamic Lighting** - Multiple light sources with colored accents
- **Particle Effects** - Explosion effects for bombs
- **Smooth Animations**:
  - Block removal with spin effect
  - Gravity-driven block falling
  - Cursor pulse animation
- **Sound Effects** - Web Audio API beeps for actions
- **Professional HUD**:
  - Real-time score tracking
  - Combo counter
  - Level indicator
  - Block counter
  - Core progress bar
  - Selected blocks display

### Camera & Controls

- **Free Camera Rotation** - Drag to rotate, arrow keys for manual control
- **Auto-Rotation** - Optional automatic camera rotation
- **Zoom Control** - Mouse wheel to zoom in/out (15-40 unit range)
- **Intelligent Camera** - Maintains focus on sphere center

## How to Play

### Quick Start

1. Open `index.html` in a modern web browser
2. Select your difficulty (Easy, Medium, or Hard)
3. The game begins immediately with the sphere loaded

### Controls

| Control | Action |
|---------|--------|
| **W/A/S/D** | Move cursor around sphere (up/left/down/right) |
| **SPACE** | Drop selected blocks (requires 3+ matching blocks) |
| **Q / E** | Slide blocks left/right |
| **ARROW KEYS** | Manually rotate camera view |
| **MOUSE DRAG** | Rotate camera around sphere |
| **MOUSE WHEEL** | Zoom in/out |
| **P** | Pause/Resume game |
| **R** | Restart current level |

### Gameplay Strategy

1. **Cursor Movement**: Navigate to a block on the current layer
2. **Selection**: The game automatically selects all connected matching blocks
3. **Minimum Match**: You need at least 3 connected blocks to drop
4. **Drop**: Press SPACE to eliminate selected blocks
5. **Gravity**: Blocks from inner layers fall to fill gaps
6. **Cascades**: Watch for chain reactions as new matches form
7. **Layer Clear**: Complete a layer to progress inward
8. **Level Complete**: Clear all layers to advance to next level

### Scoring System

- **Base Points**: 100 × blocks × (blocks - 2)
- **Examples**:
  - 3 blocks = 300 points
  - 5 blocks = 1,500 points
  - 10 blocks = 8,000 points
- **Combo Multiplier**: Each cascade increases multiplier
- **Bomb Bonus**: 50 points per block destroyed
- **Level Completion**: 5,000 × level number bonus

## Technical Details

### Architecture

```
TetrisphereEmulator (Main Class)
├── Sphere Generation
│   ├── Layer-based construction
│   ├── Spherical coordinate mapping
│   └── Block type distribution
├── Game Logic
│   ├── Cursor system with grid navigation
│   ├── Flood-fill selection algorithm
│   ├── Drop mechanics
│   └── Gravity simulation
├── Rendering
│   ├── Three.js WebGL renderer
│   ├── Dynamic camera system
│   └── Particle effects
└── UI/HUD
    ├── Real-time statistics
    ├── Progress tracking
    └── Game state management
```

### Block Types

Each block type has unique geometry:

- **Square**: BoxGeometry (0.9×0.9×0.9) - Green (#00ff88)
- **Circle**: SphereGeometry (radius 0.5) - Blue (#0088ff)
- **Triangle**: ConeGeometry (3-sided pyramid) - Pink (#ff0088)
- **Bomb**: Low-poly sphere (8 segments) - Orange (#ff8800)
- **Wildcard**: OctahedronGeometry - Yellow (#ffff00)

### Spherical Grid System

The sphere uses a latitude/longitude grid system:

- **Latitude**: Segments from pole to pole (varies by layer)
- **Longitude**: Segments around equator (density based on circumference)
- **Grid Wrapping**: Cursor movement wraps at boundaries
- **Neighbor Detection**: 4-directional adjacency (up/down/left/right)

### Performance

- **60 FPS** target framerate
- **Efficient rendering** with visibility culling
- **Optimized particle system** with automatic cleanup
- **Responsive design** adapts to window resize
- **Memory management** removes inactive objects

## Browser Compatibility

- **Chrome/Edge**: ✅ Full support
- **Firefox**: ✅ Full support
- **Safari**: ✅ Full support (iOS 12+)
- **Opera**: ✅ Full support

**Requirements**:
- WebGL support
- ES6 JavaScript support
- Web Audio API (optional, for sound)

## Development

### File Structure

```
ClaudeWork/
├── index.html          # Main HTML with UI and styling
├── app.js             # Complete game engine (~1100 lines)
└── README.md          # This file
```

### Dependencies

- **Three.js** (r128) - Loaded from CDN
- No build process required
- No npm packages needed
- Pure vanilla JavaScript

### Customization

You can easily customize:

```javascript
// In app.js, modify difficulty settings:
this.difficultySettings = {
    easy: { layers: 5, blocksPerLayer: 8, powerUpChance: 0.15 },
    medium: { layers: 8, blocksPerLayer: 12, powerUpChance: 0.10 },
    hard: { layers: 12, blocksPerLayer: 16, powerUpChance: 0.05 }
};

// Modify block colors:
const BlockColors = {
    [BlockType.SQUARE]: 0x00ff88,    // Change colors here
    [BlockType.CIRCLE]: 0x0088ff,
    [BlockType.TRIANGLE]: 0xff0088,
    // ...
};

// Adjust scoring:
calculatePoints(numBlocks) {
    const basePoints = 100;  // Modify base points
    return basePoints * numBlocks * (numBlocks - 2);
}
```

## Differences from Original

This emulator is highly accurate but has some differences from the N64 original:

**Simplified**:
- Slide mechanic is simplified (original had complex physics)
- No music (only simple sound effects)
- Simplified background (original had animated backgrounds)
- No story mode or special challenges

**Enhanced**:
- Higher resolution graphics
- Smoother animations (60 FPS vs original 30 FPS)
- More flexible camera controls
- Real-time statistics display

**Accurate**:
- ✅ Multi-layer sphere structure
- ✅ Three block types with matching
- ✅ Grid-based cursor movement
- ✅ Drop mechanic (match 3+)
- ✅ Gravity and cascades
- ✅ Combo system
- ✅ Power-ups (bombs and wildcards)
- ✅ Level progression
- ✅ Core drilling mechanic

## Future Enhancements

Potential additions:

- [ ] Background music (synthwave style)
- [ ] More sophisticated sound effects
- [ ] Additional block types
- [ ] Time attack mode
- [ ] Puzzle mode with pre-set challenges
- [ ] High score persistence (localStorage)
- [ ] Mobile touch controls
- [ ] Gamepad support
- [ ] Replay system
- [ ] Screenshots/sharing

## Credits

- **Original Game**: Tetrisphere (N64, 1997) by H2O Entertainment
- **This Emulator**: Built with Three.js and vanilla JavaScript
- **Purpose**: Educational recreation and tribute to the original

## License

This is a fan project created for educational purposes. Tetrisphere is a trademark of Nintendo. This project is not affiliated with or endorsed by Nintendo.

## Changelog

### Version 1.0.0 (2025-12-29)

- ✅ Complete emulator implementation
- ✅ All core mechanics functional
- ✅ Three difficulty levels
- ✅ Full HUD and UI
- ✅ Sound effects
- ✅ Power-ups (bombs, wildcards)
- ✅ Gravity and cascade system
- ✅ Level progression
- ✅ Combo multipliers
- ✅ Visual effects and animations

---

**Enjoy playing this authentic recreation of the classic Tetrisphere puzzle game!**
