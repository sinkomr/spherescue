// Tetrisphere Practice Environment
class TetrisphereEnvironment {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.blocks = [];
        this.shapeGroup = null;
        this.autoRotate = false;
        this.mouse = { x: 0, y: 0 };
        this.isDragging = false;
        this.previousMouse = { x: 0, y: 0 };
        this.raycaster = new THREE.Raycaster();
        this.mouseVector = new THREE.Vector2();

        this.init();
        this.createShape();
        this.setupEventListeners();
        this.animate();
    }

    init() {
        // Setup scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);
        this.scene.fog = new THREE.Fog(0x0a0a1a, 20, 50);

        // Setup camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 15);

        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);

        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight1.position.set(5, 5, 5);
        this.scene.add(directionalLight1);

        const directionalLight2 = new THREE.DirectionalLight(0x00ff88, 0.4);
        directionalLight2.position.set(-5, -5, -5);
        this.scene.add(directionalLight2);

        const pointLight = new THREE.PointLight(0x7e22ce, 1, 50);
        pointLight.position.set(0, 0, 10);
        this.scene.add(pointLight);

        // Create group for the shape
        this.shapeGroup = new THREE.Group();
        this.scene.add(this.shapeGroup);
    }

    createShape() {
        // Clear existing blocks
        this.blocks.forEach(block => {
            this.shapeGroup.remove(block.mesh);
        });
        this.blocks = [];

        // Create a sphere-like structure made of blocks
        const radius = 5;
        const segments = 12;
        const colors = [0x00ff88, 0x0088ff, 0xff0088, 0xffff00, 0xff8800, 0x8800ff];

        // Generate blocks in a spherical pattern
        for (let lat = 0; lat < segments; lat++) {
            const theta = (lat / segments) * Math.PI;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            const circumference = 2 * Math.PI * radius * sinTheta;
            const numBlocksInRing = Math.max(3, Math.floor(circumference / 1.2));

            for (let lon = 0; lon < numBlocksInRing; lon++) {
                const phi = (lon / numBlocksInRing) * 2 * Math.PI;

                const x = radius * sinTheta * Math.cos(phi);
                const y = radius * cosTheta;
                const z = radius * sinTheta * Math.sin(phi);

                // Create block
                const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
                const color = colors[Math.floor(Math.random() * colors.length)];
                const material = new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.2,
                    metalness: 0.3,
                    roughness: 0.7
                });

                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(x, y, z);

                // Orient block to face outward from center
                mesh.lookAt(0, 0, 0);
                mesh.rotateY(Math.PI);

                this.shapeGroup.add(mesh);
                this.blocks.push({
                    mesh: mesh,
                    originalColor: color,
                    removed: false
                });
            }
        }
    }

    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Mouse controls
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.previousMouse = { x: e.clientX, y: e.clientY };
        });

        this.renderer.domElement.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.previousMouse.x;
                const deltaY = e.clientY - this.previousMouse.y;

                this.camera.position.applyAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    deltaX * 0.005
                );

                const right = new THREE.Vector3(1, 0, 0);
                right.applyQuaternion(this.camera.quaternion);
                this.camera.position.applyAxisAngle(right, deltaY * 0.005);

                this.camera.lookAt(0, 0, 0);
                this.previousMouse = { x: e.clientX, y: e.clientY };
            }

            // Update mouse vector for raycasting
            this.mouseVector.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouseVector.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        this.renderer.domElement.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.renderer.domElement.addEventListener('click', (e) => {
            if (!this.isDragging) {
                this.handleBlockClick();
            }
        });

        // Mouse wheel for zoom
        this.renderer.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.1;
            const direction = this.camera.position.clone().normalize();

            if (e.deltaY > 0) {
                this.camera.position.add(direction.multiplyScalar(-zoomSpeed));
            } else {
                this.camera.position.add(direction.multiplyScalar(zoomSpeed));
            }

            const distance = this.camera.position.length();
            if (distance < 8) this.camera.position.normalize().multiplyScalar(8);
            if (distance > 30) this.camera.position.normalize().multiplyScalar(30);
        });

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            const rotationSpeed = 0.05;

            switch(e.key) {
                case 'ArrowLeft':
                    this.shapeGroup.rotation.y += rotationSpeed;
                    break;
                case 'ArrowRight':
                    this.shapeGroup.rotation.y -= rotationSpeed;
                    break;
                case 'ArrowUp':
                    this.shapeGroup.rotation.x += rotationSpeed;
                    break;
                case 'ArrowDown':
                    this.shapeGroup.rotation.x -= rotationSpeed;
                    break;
                case ' ':
                    e.preventDefault();
                    this.autoRotate = !this.autoRotate;
                    break;
            }
        });

        // Reset button
        document.getElementById('reset-btn').addEventListener('click', () => {
            this.createShape();
            this.shapeGroup.rotation.set(0, 0, 0);
            this.autoRotate = false;
        });
    }

    handleBlockClick() {
        this.raycaster.setFromCamera(this.mouseVector, this.camera);

        const activeBlocks = this.blocks.filter(b => !b.removed).map(b => b.mesh);
        const intersects = this.raycaster.intersectObjects(activeBlocks);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const block = this.blocks.find(b => b.mesh === clickedMesh);

            if (block && !block.removed) {
                // Animate block removal
                this.animateBlockRemoval(block);
            }
        }
    }

    animateBlockRemoval(block) {
        block.removed = true;

        const startScale = 1;
        const startOpacity = 1;
        const duration = 500; // ms
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const scale = startScale * (1 - progress);
            block.mesh.scale.set(scale, scale, scale);
            block.mesh.material.opacity = startOpacity * (1 - progress);
            block.mesh.material.transparent = true;

            // Add some rotation during removal
            block.mesh.rotation.x += 0.1;
            block.mesh.rotation.y += 0.1;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.shapeGroup.remove(block.mesh);
            }
        };

        animate();
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Auto-rotate shape if enabled
        if (this.autoRotate) {
            this.shapeGroup.rotation.y += 0.005;
            this.shapeGroup.rotation.x += 0.002;
        }

        // Add subtle floating animation to non-removed blocks
        const time = Date.now() * 0.001;
        this.blocks.forEach((block, index) => {
            if (!block.removed) {
                const offset = index * 0.1;
                const originalPos = block.mesh.position.clone().normalize().multiplyScalar(5);
                const floatAmount = Math.sin(time + offset) * 0.02;

                block.mesh.position.copy(originalPos).multiplyScalar(1 + floatAmount);
            }
        });

        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the environment when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new TetrisphereEnvironment();
});
