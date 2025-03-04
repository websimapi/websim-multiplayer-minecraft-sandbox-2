import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { WorldManager } from './world.js';
import { BlockTypes } from './blocks.js';

class Game {
  constructor() {
    this.isMobile = window.innerWidth <= 768;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(5, 20, 20);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87CEEB);
    this.renderer.shadowMap.enabled = true;
    
    document.getElementById('game-container').appendChild(this.renderer.domElement);

    this.setupControls();
    this.setupLighting();
    this.setupEventListeners();
    
    this.worldManager = new WorldManager(this.scene);
    this.currentBlockType = Object.keys(BlockTypes)[0];
    this.isBreakMode = false;
    
    this.room = new WebsimSocket();
    this.setupMultiplayer();
    
    this.createBlockPalette();
    this.animate();
  }

  setupMultiplayer() {
    // Handle player connections and movements
    this.players = {};
    this.playerMeshes = {};
    
    this.room.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case "connected":
          this.updatePlayersList();
          break;
        case "disconnected":
          if (this.playerMeshes[data.clientId]) {
            this.scene.remove(this.playerMeshes[data.clientId]);
            delete this.playerMeshes[data.clientId];
          }
          this.updatePlayersList();
          break;
        case "playerMove":
          this.updatePlayerPosition(data.clientId, data.position, data.rotation);
          break;
      }
    };
    
    // Fetch the world data when connecting
    this.room.party.subscribe(() => {
      this.worldManager.loadWorld(this.room);
      this.updatePlayersList();
    });
    
    // Setup movement broadcasting
    setInterval(() => {
      if (this.controls instanceof PointerLockControls) {
        this.room.send({
          type: "playerMove",
          position: this.controls.getObject().position.toArray(),
          rotation: this.camera.rotation.y
        });
      }
    }, 100);
  }
  
  updatePlayersList() {
    const playersContainer = document.getElementById('players-container');
    playersContainer.innerHTML = '<h3>Players</h3>';
    
    for (const clientId in this.room.party.peers) {
      const username = this.room.party.peers[clientId].username;
      
      const playerItem = document.createElement('div');
      playerItem.className = 'player-item';
      
      const avatar = document.createElement('img');
      avatar.className = 'player-avatar';
      avatar.src = `https://images.websim.ai/avatar/${username}`;
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'player-name';
      nameSpan.textContent = username;
      
      playerItem.appendChild(avatar);
      playerItem.appendChild(nameSpan);
      playersContainer.appendChild(playerItem);
      
      // Create or update 3D player representation
      if (clientId !== this.room.party.client.id && !this.playerMeshes[clientId]) {
        this.createPlayerMesh(clientId, username);
      }
    }
  }
  
  createPlayerMesh(clientId, username) {
    const playerGeometry = new THREE.BoxGeometry(0.8, 1.8, 0.8);
    const playerMaterial = new THREE.MeshLambertMaterial({ color: 0x00aaff });
    const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    
    playerMesh.position.set(0, 10, 0);
    playerMesh.castShadow = true;
    
    // Add username label
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = '#000000AA';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.font = '24px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.fillText(username, canvas.width / 2, canvas.height / 2 + 8);
    
    const texture = new THREE.CanvasTexture(canvas);
    const labelMaterial = new THREE.SpriteMaterial({ map: texture });
    const label = new THREE.Sprite(labelMaterial);
    label.position.y = 1.5;
    label.scale.set(2, 0.5, 1);
    
    playerMesh.add(label);
    this.scene.add(playerMesh);
    this.playerMeshes[clientId] = playerMesh;
  }
  
  updatePlayerPosition(clientId, position, rotation) {
    if (this.playerMeshes[clientId]) {
      const playerMesh = this.playerMeshes[clientId];
      playerMesh.position.fromArray(position);
      playerMesh.rotation.y = rotation;
    }
  }

  setupControls() {
    if (this.isMobile) {
      // OrbitControls for mobile
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      
      // Setup joystick for movement
      const joystickContainer = document.getElementById('joystick-container');
      this.joystick = nipplejs.create({
        zone: joystickContainer,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white',
        size: 120
      });
      
      this.moveDirection = new THREE.Vector3();
      this.moveSpeed = 0.1;
      
      this.joystick.on('move', (event, data) => {
        const forward = -data.vector.y * this.moveSpeed;
        const right = data.vector.x * this.moveSpeed;
        
        this.moveDirection.set(right, 0, forward);
        this.moveDirection.applyQuaternion(this.camera.quaternion);
      });
      
      this.joystick.on('end', () => {
        this.moveDirection.set(0, 0, 0);
      });
    } else {
      // PointerLockControls for desktop
      this.controls = new PointerLockControls(this.camera, document.body);
      this.scene.add(this.controls.getObject());
      
      this.moveForward = false;
      this.moveBackward = false;
      this.moveLeft = false;
      this.moveRight = false;
      this.canJump = false;
      
      this.velocity = new THREE.Vector3();
      this.direction = new THREE.Vector3();
      
      this.renderer.domElement.addEventListener('click', () => {
        this.controls.lock();
      });
    }
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -25;
    directionalLight.shadow.camera.right = 25;
    directionalLight.shadow.camera.top = 25;
    directionalLight.shadow.camera.bottom = -25;
    
    this.scene.add(directionalLight);
  }

  setupEventListeners() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.isMobile = window.innerWidth <= 768;
    });
    
    if (!this.isMobile) {
      document.addEventListener('keydown', (event) => {
        switch (event.code) {
          case 'KeyW': this.moveForward = true; break;
          case 'KeyA': this.moveLeft = true; break;
          case 'KeyS': this.moveBackward = true; break;
          case 'KeyD': this.moveRight = true; break;
          case 'Space': 
            if (this.canJump) {
              this.velocity.y = 10;
              this.canJump = false;
            }
            break;
        }
      });
      
      document.addEventListener('keyup', (event) => {
        switch (event.code) {
          case 'KeyW': this.moveForward = false; break;
          case 'KeyA': this.moveLeft = false; break;
          case 'KeyS': this.moveBackward = false; break;
          case 'KeyD': this.moveRight = false; break;
        }
      });
    }
    
    document.getElementById('break-mode').addEventListener('click', () => {
      this.toggleBreakMode();
    });
    
    // Handle block placement/breaking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if (this.controls instanceof PointerLockControls && this.controls.isLocked) {
        this.handleBlockAction(e);
      }
    });
    
    this.renderer.domElement.addEventListener('touchstart', (e) => {
      // Don't handle touch on block palette or buttons
      if (e.target !== this.renderer.domElement) return;
      
      // Only handle single touch for block actions
      if (e.touches.length === 1) {
        this.handleBlockAction(e.touches[0]);
      }
    });
  }
  
  handleBlockAction(event) {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    
    const intersects = this.raycaster.intersectObjects(this.worldManager.blockMeshes);
    
    if (intersects.length > 0 && intersects[0].distance < 10) {
      const intersect = intersects[0];
      
      if (this.isBreakMode) {
        // Break block
        const blockPosition = this.worldManager.getBlockPosition(intersect.object);
        this.worldManager.removeBlock(blockPosition, this.room);
      } else {
        // Place block
        const normal = intersect.face.normal;
        const point = new THREE.Vector3()
          .copy(intersect.point)
          .add(normal.multiplyScalar(0.5));
        
        const blockPosition = this.worldManager.snapToGrid(point);
        this.worldManager.addBlock(blockPosition, this.currentBlockType, this.room);
      }
    }
  }
  
  toggleBreakMode() {
    this.isBreakMode = !this.isBreakMode;
    const breakBtn = document.getElementById('break-mode');
    
    if (this.isBreakMode) {
      breakBtn.classList.add('active');
      breakBtn.textContent = 'Build Mode';
    } else {
      breakBtn.classList.remove('active');
      breakBtn.textContent = 'Break Mode';
    }
  }
  
  createBlockPalette() {
    const palette = document.getElementById('block-palette');
    
    Object.entries(BlockTypes).forEach(([type, data]) => {
      const blockOption = document.createElement('div');
      blockOption.className = 'block-option';
      blockOption.style.backgroundColor = data.color;
      blockOption.dataset.type = type;
      
      if (type === this.currentBlockType) {
        blockOption.classList.add('selected');
      }
      
      blockOption.addEventListener('click', () => {
        document.querySelectorAll('.block-option').forEach(el => {
          el.classList.remove('selected');
        });
        blockOption.classList.add('selected');
        this.currentBlockType = type;
        this.isBreakMode = false;
        document.getElementById('break-mode').classList.remove('active');
        document.getElementById('break-mode').textContent = 'Break Mode';
      });
      
      palette.appendChild(blockOption);
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    const time = performance.now();
    const delta = (time - (this.prevTime || time)) / 1000;
    this.prevTime = time;
    
    if (this.controls instanceof PointerLockControls && this.controls.isLocked) {
      // Apply gravity
      this.velocity.y -= 9.8 * delta;
      
      // Check ground collision
      const playerPos = this.controls.getObject().position.clone();
      playerPos.y -= 1.8; // Adjust for player height
      
      if (playerPos.y <= 0) {
        this.velocity.y = 0;
        this.controls.getObject().position.y = 1.8;
        this.canJump = true;
      }
      
      // Movement
      this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
      this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
      this.direction.normalize();
      
      if (this.moveForward || this.moveBackward) {
        this.velocity.z = -this.direction.z * 5.0;
      } else {
        this.velocity.z = 0;
      }
      
      if (this.moveLeft || this.moveRight) {
        this.velocity.x = -this.direction.x * 5.0;
      } else {
        this.velocity.x = 0;
      }
      
      this.controls.moveRight(-this.velocity.x * delta);
      this.controls.moveForward(-this.velocity.z * delta);
      this.controls.getObject().position.y += this.velocity.y * delta;
      
      // Prevent going below ground
      if (this.controls.getObject().position.y < 1.8) {
        this.controls.getObject().position.y = 1.8;
      }
    } else if (this.isMobile && this.moveDirection) {
      // Mobile movement using joystick
      this.camera.position.add(this.moveDirection);
    }
    
    if (this.controls instanceof OrbitControls) {
      this.controls.update();
    }
    
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
  
  // Hide loading message after game is initialized
  setTimeout(() => {
    document.getElementById('loading').style.display = 'none';
  }, 2000);
});