// ====================================================================
// TETRISPHERE EMULATOR
// An accurate recreation of the N64 puzzle game
// ====================================================================

// Block Types
const BlockType = {
    SQUARE: 'square',
    CIRCLE: 'circle',
    TRIANGLE: 'triangle',
    BOMB: 'bomb',
    WILDCARD: 'wildcard',
    EMPTY: 'empty'
};

// Block Type Colors
const BlockColors = {
    [BlockType.SQUARE]: 0x00ff88,
    [BlockType.CIRCLE]: 0x0088ff,
    [BlockType.TRIANGLE]: 0xff0088,
    [BlockType.BOMB]: 0xff8800,
    [BlockType.WILDCARD]: 0xffff00
};

// Game States
const GameState = {
    START: 'start',
    PLAYING: 'playing',
    PAUSED: 'paused',
    LEVEL_COMPLETE: 'levelComplete',
    GAME_OVER: 'gameOver'
};

// ====================================================================
// MAIN GAME CLASS
// ====================================================================

class TetrisphereEmulator {
    constructor() {
        // Three.js essentials
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.raycaster = new THREE.Raycaster();
        this.mouseVector = new THREE.Vector2();

        // Game state
        this.gameState = GameState.START;
        this.difficulty = 'medium';
        this.level = 1;
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;

        // Sphere structure
        this.layers = [];
        this.numLayers = 8;
        this.currentLayer = 0;
        this.sphereGroup = new THREE.Group();
        this.blocks = [];

        // Cursor
        this.cursor = null;
        this.cursorPosition = { layer: 0, lat: 0, lon: 0 };
        this.selectedBlocks = [];

        // Camera control
        this.cameraRotation = { x: 0, y: 0 };
        this.isDragging = false;
        this.previousMouse = { x: 0, y: 0 };
        this.autoRotate = true;

        // Gameplay
        this.isProcessing = false;
        this.gravityQueue = [];

        // Difficulty settings
        this.difficultySettings = {
            easy: { layers: 5, blocksPerLayer: 8, powerUpChance: 0.15 },
            medium: { layers: 8, blocksPerLayer: 12, powerUpChance: 0.10 },
            hard: { layers: 12, blocksPerLayer: 16, powerUpChance: 0.05 }
        };

        // Particle effects
        this.particles = [];
    }

    // ================================================================
    // INITIALIZATION
    // ================================================================

    init(difficulty = 'medium') {
        this.difficulty = difficulty;
        const settings = this.difficultySettings[difficulty];
        this.numLayers = settings.layers;

        // Setup Three.js
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLighting();

        // Create game elements
        this.createSphere();
        this.createCursor();
        this.setupEventListeners();

        // Start game loop
        this.gameState = GameState.PLAYING;
        this.updateHUD();
        this.animate();
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);
        this.scene.fog = new THREE.Fog(0x0a0a1a, 30, 60);
        this.scene.add(this.sphereGroup);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 8, 25);
        this.camera.lookAt(0, 0, 0);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
    }

    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0x404040, 1.2);
        this.scene.add(ambient);

        // Directional lights
        const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dir1.position.set(10, 10, 10);
        dir1.castShadow = true;
        this.scene.add(dir1);

        const dir2 = new THREE.DirectionalLight(0x00ff88, 0.4);
        dir2.position.set(-10, -5, -10);
        this.scene.add(dir2);

        // Point lights for dramatic effect
        const point1 = new THREE.PointLight(0x0088ff, 1, 50);
        point1.position.set(0, 15, 0);
        this.scene.add(point1);

        const point2 = new THREE.PointLight(0xff0088, 0.8, 50);
        point2.position.set(0, -15, 0);
        this.scene.add(point2);
    }

    // ================================================================
    // SPHERE GENERATION
    // ================================================================

    createSphere() {
        // Clear existing sphere
        this.blocks.forEach(block => {
            if (block.mesh) this.sphereGroup.remove(block.mesh);
        });
        this.blocks = [];
        this.layers = [];

        const settings = this.difficultySettings[this.difficulty];
        const baseRadius = 12;
        const layerThickness = 1.2;

        // Generate layers from outside to inside
        for (let layer = 0; layer < this.numLayers; layer++) {
            const radius = baseRadius - (layer * layerThickness);
            const layerBlocks = this.generateLayer(layer, radius, settings.blocksPerLayer);
            this.layers.push(layerBlocks);
            this.blocks.push(...layerBlocks);
        }

        this.currentLayer = 0;
        this.updateBlockVisibility();
    }

    generateLayer(layerIndex, radius, segmentCount) {
        const blocks = [];
        const latSegments = Math.max(4, Math.floor(segmentCount * 0.6));
        const powerUpChance = this.difficultySettings[this.difficulty].powerUpChance;

        for (let lat = 0; lat < latSegments; lat++) {
            const theta = (lat / latSegments) * Math.PI;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            const circumference = 2 * Math.PI * radius * sinTheta;
            const lonSegments = Math.max(3, Math.floor(circumference / 1.5));

            for (let lon = 0; lon < lonSegments; lon++) {
                const phi = (lon / lonSegments) * 2 * Math.PI;

                // Calculate position
                const x = radius * sinTheta * Math.cos(phi);
                const y = radius * cosTheta;
                const z = radius * sinTheta * Math.sin(phi);

                // Determine block type
                let blockType;
                const rand = Math.random();

                if (rand < powerUpChance * 0.3) {
                    blockType = BlockType.BOMB;
                } else if (rand < powerUpChance) {
                    blockType = BlockType.WILDCARD;
                } else {
                    const types = [BlockType.SQUARE, BlockType.CIRCLE, BlockType.TRIANGLE];
                    blockType = types[Math.floor(Math.random() * types.length)];
                }

                // Create block
                const block = this.createBlock(blockType, x, y, z, layerIndex, lat, lon);
                blocks.push(block);
            }
        }

        return blocks;
    }

    createBlock(type, x, y, z, layer, lat, lon) {
        let geometry;

        // Create geometry based on type
        switch(type) {
            case BlockType.SQUARE:
                geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
                break;
            case BlockType.CIRCLE:
                geometry = new THREE.SphereGeometry(0.5, 16, 16);
                break;
            case BlockType.TRIANGLE:
                geometry = new THREE.ConeGeometry(0.5, 0.9, 3);
                break;
            case BlockType.BOMB:
                geometry = new THREE.SphereGeometry(0.5, 8, 8);
                break;
            case BlockType.WILDCARD:
                geometry = new THREE.OctahedronGeometry(0.5);
                break;
            default:
                geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
        }

        const color = BlockColors[type];
        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.3,
            metalness: 0.4,
            roughness: 0.6
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.lookAt(0, 0, 0);

        // For triangles, orient them pointing outward
        if (type === BlockType.TRIANGLE) {
            mesh.rotateX(-Math.PI / 2);
        }

        this.sphereGroup.add(mesh);

        return {
            type: type,
            mesh: mesh,
            position: { x, y, z },
            gridPosition: { layer, lat, lon },
            active: true,
            selected: false,
            falling: false,
            originalColor: color
        };
    }

    updateBlockVisibility() {
        // Show only blocks on current and next layer
        this.blocks.forEach(block => {
            if (!block.active) {
                block.mesh.visible = false;
                return;
            }

            const layer = block.gridPosition.layer;
            if (layer === this.currentLayer || layer === this.currentLayer + 1) {
                block.mesh.visible = true;
                // Outer layer is slightly transparent to see inner layer
                if (layer === this.currentLayer + 1) {
                    block.mesh.material.opacity = 0.3;
                    block.mesh.material.transparent = true;
                } else {
                    block.mesh.material.opacity = 1.0;
                    block.mesh.material.transparent = false;
                }
            } else {
                block.mesh.visible = false;
            }
        });
    }

    // ================================================================
    // CURSOR SYSTEM
    // ================================================================

    createCursor() {
        // Create cursor indicator (glowing ring)
        const cursorGeometry = new THREE.TorusGeometry(0.8, 0.15, 16, 32);
        const cursorMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.8,
            metalness: 0.8,
            roughness: 0.2
        });

        this.cursor = new THREE.Mesh(cursorGeometry, cursorMaterial);
        this.scene.add(this.cursor);
        this.updateCursorPosition();
    }

    updateCursorPosition() {
        const block = this.getBlockAt(
            this.cursorPosition.layer,
            this.cursorPosition.lat,
            this.cursorPosition.lon
        );

        if (block && block.active) {
            const pos = block.position;
            this.cursor.position.set(pos.x, pos.y, pos.z);
            this.cursor.lookAt(0, 0, 0);

            // Pulse effect
            const scale = 1 + Math.sin(Date.now() * 0.005) * 0.1;
            this.cursor.scale.set(scale, scale, 1);
        }
    }

    moveCursor(dlat, dlon) {
        if (this.isProcessing || this.gameState !== GameState.PLAYING) return;

        const currentLayerBlocks = this.layers[this.cursorPosition.layer];
        if (!currentLayerBlocks) return;

        // Get grid dimensions for current latitude
        const maxLat = Math.max(...currentLayerBlocks.map(b => b.gridPosition.lat));
        const blocksAtLat = currentLayerBlocks.filter(
            b => b.gridPosition.lat === this.cursorPosition.lat
        );
        const maxLon = blocksAtLat.length - 1;

        // Move with wrapping
        this.cursorPosition.lat = (this.cursorPosition.lat + dlat + maxLat + 1) % (maxLat + 1);
        this.cursorPosition.lon = (this.cursorPosition.lon + dlon + maxLon + 1) % (maxLon + 1);

        this.updateCursorPosition();
        this.updateSelection();
    }

    // ================================================================
    // BLOCK SELECTION & MATCHING
    // ================================================================

    updateSelection() {
        // Clear previous selection
        this.selectedBlocks.forEach(block => {
            block.selected = false;
            if (block.active) {
                block.mesh.material.emissiveIntensity = 0.3;
            }
        });
        this.selectedBlocks = [];

        // Get block at cursor
        const centerBlock = this.getBlockAt(
            this.cursorPosition.layer,
            this.cursorPosition.lat,
            this.cursorPosition.lon
        );

        if (!centerBlock || !centerBlock.active) {
            this.updateSelectionDisplay();
            return;
        }

        // Find all connected blocks of the same type (or wildcards)
        const targetType = centerBlock.type;
        if (targetType === BlockType.WILDCARD || targetType === BlockType.BOMB) {
            this.selectedBlocks = [centerBlock];
        } else {
            this.selectedBlocks = this.floodFill(centerBlock, targetType);
        }

        // Highlight selected blocks
        this.selectedBlocks.forEach(block => {
            block.selected = true;
            block.mesh.material.emissiveIntensity = 0.8;
        });

        this.updateSelectionDisplay();
    }

    floodFill(startBlock, targetType) {
        const result = [];
        const visited = new Set();
        const queue = [startBlock];

        while (queue.length > 0) {
            const block = queue.shift();
            const key = `${block.gridPosition.layer}-${block.gridPosition.lat}-${block.gridPosition.lon}`;

            if (visited.has(key)) continue;
            visited.add(key);

            if (!block.active) continue;

            // Check if block matches (same type or wildcard)
            if (block.type === targetType || block.type === BlockType.WILDCARD) {
                result.push(block);

                // Add neighbors to queue
                const neighbors = this.getNeighbors(block);
                neighbors.forEach(neighbor => {
                    const nKey = `${neighbor.gridPosition.layer}-${neighbor.gridPosition.lat}-${neighbor.gridPosition.lon}`;
                    if (!visited.has(nKey)) {
                        queue.push(neighbor);
                    }
                });
            }
        }

        return result;
    }

    getNeighbors(block) {
        const { layer, lat, lon } = block.gridPosition;
        const neighbors = [];
        const offsets = [
            { dlat: 0, dlon: 1 },
            { dlat: 0, dlon: -1 },
            { dlat: 1, dlon: 0 },
            { dlat: -1, dlon: 0 }
        ];

        offsets.forEach(offset => {
            const neighbor = this.getBlockAtRelative(layer, lat, lon, offset.dlat, offset.dlon);
            if (neighbor) neighbors.push(neighbor);
        });

        return neighbors;
    }

    getBlockAt(layer, lat, lon) {
        return this.blocks.find(b =>
            b.gridPosition.layer === layer &&
            b.gridPosition.lat === lat &&
            b.gridPosition.lon === lon &&
            b.active
        );
    }

    getBlockAtRelative(layer, lat, lon, dlat, dlon) {
        const currentLayerBlocks = this.layers[layer];
        if (!currentLayerBlocks) return null;

        const maxLat = Math.max(...currentLayerBlocks.map(b => b.gridPosition.lat));
        const blocksAtLat = currentLayerBlocks.filter(b => b.gridPosition.lat === lat);
        const maxLon = blocksAtLat.length - 1;

        const newLat = (lat + dlat + maxLat + 1) % (maxLat + 1);
        const newLon = (lon + dlon + maxLon + 1) % (maxLon + 1);

        return this.getBlockAt(layer, newLat, newLon);
    }

    // ================================================================
    // DROP MECHANIC
    // ================================================================

    dropBlocks() {
        if (this.isProcessing || this.gameState !== GameState.PLAYING) return;
        if (this.selectedBlocks.length < 3 && !this.hasPowerUp()) return;

        this.isProcessing = true;
        this.playDropSound();

        // Handle special blocks
        if (this.selectedBlocks.some(b => b.type === BlockType.BOMB)) {
            this.handleBomb(this.selectedBlocks[0]);
            return;
        }

        // Remove selected blocks
        this.removeBlocks(this.selectedBlocks);

        // Update score
        const points = this.calculatePoints(this.selectedBlocks.length);
        this.addScore(points);

        // Show combo if applicable
        if (this.selectedBlocks.length >= 5) {
            this.showCombo();
        }

        // Clear selection
        this.selectedBlocks = [];
        this.updateSelectionDisplay();

        // Apply gravity after a short delay
        setTimeout(() => {
            this.applyGravity();
        }, 300);
    }

    hasPowerUp() {
        return this.selectedBlocks.some(b =>
            b.type === BlockType.BOMB || b.type === BlockType.WILDCARD
        );
    }

    handleBomb(bombBlock) {
        // Bomb destroys all blocks in a radius
        const bombPos = bombBlock.position;
        const radius = 3;
        const affectedBlocks = this.blocks.filter(block => {
            if (!block.active) return false;
            const dx = block.position.x - bombPos.x;
            const dy = block.position.y - bombPos.y;
            const dz = block.position.z - bombPos.z;
            return Math.sqrt(dx*dx + dy*dy + dz*dz) < radius;
        });

        this.createExplosion(bombPos);
        this.removeBlocks(affectedBlocks);
        this.addScore(affectedBlocks.length * 50);

        setTimeout(() => {
            this.applyGravity();
        }, 500);
    }

    removeBlocks(blocks) {
        blocks.forEach(block => {
            this.animateBlockRemoval(block);
        });
    }

    animateBlockRemoval(block) {
        block.active = false;

        const startScale = 1;
        const startTime = Date.now();
        const duration = 400;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const scale = startScale * (1 - progress);
            block.mesh.scale.set(scale, scale, scale);
            block.mesh.material.opacity = 1 - progress;
            block.mesh.material.transparent = true;

            // Spin while disappearing
            block.mesh.rotation.x += 0.2;
            block.mesh.rotation.y += 0.15;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                block.mesh.visible = false;
            }
        };

        animate();
    }

    // ================================================================
    // GRAVITY SYSTEM
    // ================================================================

    applyGravity() {
        let hadGravity = false;

        // Check each position for blocks that need to fall
        for (let layer = this.currentLayer; layer < this.numLayers - 1; layer++) {
            const currentLayerBlocks = this.layers[layer];
            if (!currentLayerBlocks) continue;

            currentLayerBlocks.forEach(block => {
                if (!block.active) {
                    // Check if there's a block in the layer above
                    const blockAbove = this.getBlockAt(
                        layer + 1,
                        block.gridPosition.lat,
                        block.gridPosition.lon
                    );

                    if (blockAbove && blockAbove.active) {
                        // Move block down
                        this.moveBlockDown(blockAbove, block);
                        hadGravity = true;
                    }
                }
            });
        }

        if (hadGravity) {
            // Check for new matches after gravity
            setTimeout(() => {
                if (this.checkForAutoMatches()) {
                    this.combo++;
                    this.showCombo();
                    setTimeout(() => this.applyGravity(), 500);
                } else {
                    this.combo = 0;
                    this.isProcessing = false;
                    this.checkLevelComplete();
                }
            }, 600);
        } else {
            this.combo = 0;
            this.isProcessing = false;
            this.checkLevelComplete();
        }
    }

    moveBlockDown(fromBlock, toBlock) {
        const targetPos = toBlock.position;

        // Animate the fall
        const startPos = fromBlock.mesh.position.clone();
        const startTime = Date.now();
        const duration = 500;

        fromBlock.falling = true;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = this.easeInOut(progress);

            fromBlock.mesh.position.lerpVectors(startPos,
                new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z),
                easeProgress);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                fromBlock.falling = false;
            }
        };

        animate();

        // Update block data
        toBlock.type = fromBlock.type;
        toBlock.active = true;
        toBlock.mesh = fromBlock.mesh;
        toBlock.originalColor = fromBlock.originalColor;
        toBlock.mesh.material.color.setHex(fromBlock.originalColor);
        toBlock.mesh.material.emissive.setHex(fromBlock.originalColor);
        toBlock.mesh.visible = true;

        // Clear old block
        fromBlock.active = false;
        fromBlock.mesh = null;
    }

    checkForAutoMatches() {
        // Check if any groups of 3+ exist after gravity
        const checked = new Set();
        let foundMatch = false;

        for (let layer = this.currentLayer; layer <= this.currentLayer + 1; layer++) {
            const layerBlocks = this.layers[layer];
            if (!layerBlocks) continue;

            layerBlocks.forEach(block => {
                const key = `${layer}-${block.gridPosition.lat}-${block.gridPosition.lon}`;
                if (checked.has(key) || !block.active) return;
                if (block.type === BlockType.BOMB || block.type === BlockType.WILDCARD) return;

                const group = this.floodFill(block, block.type);
                if (group.length >= 3) {
                    foundMatch = true;
                    this.removeBlocks(group);
                    this.addScore(this.calculatePoints(group.length) * (this.combo + 1));
                }

                group.forEach(b => {
                    checked.add(`${b.gridPosition.layer}-${b.gridPosition.lat}-${b.gridPosition.lon}`);
                });
            });
        }

        return foundMatch;
    }

    // ================================================================
    // SLIDE MECHANIC
    // ================================================================

    slideBlocks(direction) {
        if (this.isProcessing || this.gameState !== GameState.PLAYING) return;
        if (this.selectedBlocks.length === 0) return;

        // For simplicity, sliding moves the entire selection one position
        // In the actual game, this would be more complex
        this.playSlideSound();

        // Implementation would involve swapping block positions
        // Simplified here for the emulator
    }

    // ================================================================
    // SCORING & PROGRESSION
    // ================================================================

    calculatePoints(numBlocks) {
        const basePoints = 100;
        return basePoints * numBlocks * (numBlocks - 2);
    }

    addScore(points) {
        this.score += points;
        this.updateHUD();
    }

    checkLevelComplete() {
        // Check if current layer is clear
        const currentLayerBlocks = this.layers[this.currentLayer];
        const activeBlocks = currentLayerBlocks.filter(b => b.active);

        if (activeBlocks.length === 0) {
            // Move to next layer
            this.currentLayer++;

            if (this.currentLayer >= this.numLayers) {
                // Level complete!
                this.levelComplete();
            } else {
                this.updateBlockVisibility();
                this.cursorPosition.layer = this.currentLayer;
                this.updateCursorPosition();
                this.updateSelection();
                this.updateHUD();
            }
        }
    }

    levelComplete() {
        this.gameState = GameState.LEVEL_COMPLETE;
        this.showLevelComplete();

        // Bonus points for completion
        this.addScore(this.level * 5000);

        setTimeout(() => {
            this.level++;
            this.currentLayer = 0;
            this.createSphere();
            this.gameState = GameState.PLAYING;
            this.hideLevelComplete();
            this.updateHUD();
        }, 3000);
    }

    // ================================================================
    // VISUAL EFFECTS
    // ================================================================

    createExplosion(position) {
        // Create particle explosion effect
        const particleCount = 30;
        for (let i = 0; i < particleCount; i++) {
            const geometry = new THREE.SphereGeometry(0.1, 8, 8);
            const material = new THREE.MeshBasicMaterial({ color: 0xff8800 });
            const particle = new THREE.Mesh(geometry, material);

            particle.position.copy(position);

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5
            );

            this.scene.add(particle);
            this.particles.push({
                mesh: particle,
                velocity: velocity,
                life: 1.0
            });
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];

            particle.mesh.position.add(particle.velocity);
            particle.velocity.multiplyScalar(0.95);
            particle.life -= 0.02;

            particle.mesh.material.opacity = particle.life;
            particle.mesh.material.transparent = true;

            if (particle.life <= 0) {
                this.scene.remove(particle.mesh);
                this.particles.splice(i, 1);
            }
        }
    }

    // ================================================================
    // UI & HUD
    // ================================================================

    updateHUD() {
        document.getElementById('score').textContent = this.score.toLocaleString();
        document.getElementById('level').textContent = this.level;
        document.getElementById('combo').textContent = this.combo + 'x';

        // Count remaining blocks
        const remaining = this.blocks.filter(b => b.active).length;
        document.getElementById('blocks-remaining').textContent = remaining;

        // Core progress (how deep into the sphere)
        const progress = (this.currentLayer / this.numLayers) * 100;
        document.getElementById('core-bar').style.width = progress + '%';
        document.getElementById('core-label').textContent = Math.round(progress) + '%';
    }

    updateSelectionDisplay() {
        document.getElementById('selected-count').textContent = this.selectedBlocks.length;

        const display = document.getElementById('block-type-display');
        display.innerHTML = '';

        if (this.selectedBlocks.length > 0) {
            const type = this.selectedBlocks[0].type;
            const indicator = document.createElement('div');
            indicator.className = 'block-type-indicator';
            indicator.style.backgroundColor = '#' + BlockColors[type].toString(16).padStart(6, '0');
            display.appendChild(indicator);
        }
    }

    showCombo() {
        const comboDisplay = document.getElementById('combo-display');
        comboDisplay.textContent = `${this.combo}x COMBO!`;
        comboDisplay.style.display = 'block';

        setTimeout(() => {
            comboDisplay.style.display = 'none';
        }, 1000);
    }

    showLevelComplete() {
        document.getElementById('level-complete').style.display = 'block';
    }

    hideLevelComplete() {
        document.getElementById('level-complete').style.display = 'none';
    }

    pauseGame() {
        if (this.gameState === GameState.PLAYING) {
            this.gameState = GameState.PAUSED;
            document.getElementById('status-title').textContent = 'PAUSED';
            document.getElementById('status-message').textContent = '';
            document.getElementById('game-status').style.display = 'block';
        }
    }

    resumeGame() {
        if (this.gameState === GameState.PAUSED) {
            this.gameState = GameState.PLAYING;
            document.getElementById('game-status').style.display = 'none';
        }
    }

    restartGame() {
        this.level = 1;
        this.score = 0;
        this.combo = 0;
        this.currentLayer = 0;
        this.createSphere();
        this.gameState = GameState.PLAYING;
        document.getElementById('game-status').style.display = 'none';
        this.updateHUD();
    }

    // ================================================================
    // EVENT HANDLERS
    // ================================================================

    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (this.gameState !== GameState.PLAYING) {
                if (e.key === 'p' || e.key === 'P') {
                    this.resumeGame();
                }
                return;
            }

            switch(e.key.toLowerCase()) {
                case 'w':
                    this.moveCursor(-1, 0);
                    break;
                case 's':
                    this.moveCursor(1, 0);
                    break;
                case 'a':
                    this.moveCursor(0, -1);
                    break;
                case 'd':
                    this.moveCursor(0, 1);
                    break;
                case ' ':
                    e.preventDefault();
                    this.dropBlocks();
                    break;
                case 'q':
                    this.slideBlocks(-1);
                    break;
                case 'e':
                    this.slideBlocks(1);
                    break;
                case 'p':
                    this.pauseGame();
                    break;
                case 'r':
                    this.restartGame();
                    break;
                case 'arrowleft':
                    this.autoRotate = false;
                    this.cameraRotation.y += 0.05;
                    break;
                case 'arrowright':
                    this.autoRotate = false;
                    this.cameraRotation.y -= 0.05;
                    break;
                case 'arrowup':
                    this.autoRotate = false;
                    this.cameraRotation.x += 0.05;
                    break;
                case 'arrowdown':
                    this.autoRotate = false;
                    this.cameraRotation.x -= 0.05;
                    break;
            }
        });

        // Mouse controls for camera
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.autoRotate = false;
            this.previousMouse = { x: e.clientX, y: e.clientY };
        });

        this.renderer.domElement.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.previousMouse.x;
                const deltaY = e.clientY - this.previousMouse.y;

                this.cameraRotation.y -= deltaX * 0.005;
                this.cameraRotation.x -= deltaY * 0.005;

                this.previousMouse = { x: e.clientX, y: e.clientY };
            }
        });

        this.renderer.domElement.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // Mouse wheel for zoom
        this.renderer.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.5;

            if (e.deltaY > 0) {
                this.camera.position.multiplyScalar(1 + zoomSpeed * 0.1);
            } else {
                this.camera.position.multiplyScalar(1 - zoomSpeed * 0.1);
            }

            const dist = this.camera.position.length();
            if (dist < 15) this.camera.position.normalize().multiplyScalar(15);
            if (dist > 40) this.camera.position.normalize().multiplyScalar(40);
        });
    }

    // ================================================================
    // AUDIO (Simple beeps using Web Audio API)
    // ================================================================

    playDropSound() {
        this.playBeep(440, 0.1, 'sine');
    }

    playSlideSound() {
        this.playBeep(330, 0.08, 'square');
    }

    playBeep(frequency, duration, type = 'sine') {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = frequency;
            oscillator.type = type;
            gainNode.gain.value = 0.1;

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration);
        } catch (e) {
            // Audio not supported, silently fail
        }
    }

    // ================================================================
    // ANIMATION LOOP
    // ================================================================

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.gameState === GameState.PLAYING) {
            // Auto-rotate camera
            if (this.autoRotate) {
                this.cameraRotation.y += 0.002;
            }

            // Apply camera rotation
            const radius = this.camera.position.length();
            this.camera.position.x = radius * Math.sin(this.cameraRotation.y) * Math.cos(this.cameraRotation.x);
            this.camera.position.y = radius * Math.sin(this.cameraRotation.x);
            this.camera.position.z = radius * Math.cos(this.cameraRotation.y) * Math.cos(this.cameraRotation.x);
            this.camera.lookAt(0, 0, 0);

            // Update cursor
            this.updateCursorPosition();

            // Update particles
            this.updateParticles();
        }

        this.renderer.render(this.scene, this.camera);
    }

    // ================================================================
    // UTILITY
    // ================================================================

    easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }
}

// ====================================================================
// GLOBAL FUNCTIONS (called from HTML)
// ====================================================================

let game = null;

function startGame(difficulty) {
    document.getElementById('start-screen').style.display = 'none';
    game = new TetrisphereEmulator();
    game.init(difficulty);
}

function resumeGame() {
    if (game) game.resumeGame();
}

function restartGame() {
    if (game) game.restartGame();
}

// ====================================================================
// INITIALIZE
// ====================================================================

window.addEventListener('DOMContentLoaded', () => {
    // Game starts when user clicks a difficulty button
    console.log('Tetrisphere Emulator Ready');
});
