import * as THREE from 'three';
import { BlockTypes } from './blocks.js';

export class WorldManager {
  constructor(scene) {
    this.scene = scene;
    this.blockMeshes = [];
    this.blockMap = {};
    this.worldData = null;
    
    // Create ground plane
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x91C788 });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }
  
  loadWorld(room) {
    const loadingElement = document.getElementById('loading');
    loadingElement.style.display = 'block';
    
    // Subscribe to world changes first
    room.collection('world').subscribe(worlds => {
      if (worlds.length > 0) {
        const newWorldData = worlds[0];
        
        if (!this.worldData || newWorldData.updated_at !== this.worldData.updated_at) {
          this.worldData = newWorldData;
          this.renderWorld();
          loadingElement.style.display = 'none';
        }
      } else if (worlds.length === 0) {
        // Create a new world if none exists yet
        this.createInitialWorld(room);
      }
    });
  }
  
  createInitialWorld(room) {
    // Create a flat world with some initial blocks
    const blocks = {};
    
    // Create a small platform
    for (let x = -5; x <= 5; x++) {
      for (let z = -5; z <= 5; z++) {
        const key = `${x},0,${z}`;
        blocks[key] = 'grass';
      }
    }
    
    // Add some random blocks
    blocks['0,1,0'] = 'stone';
    blocks['2,1,2'] = 'wood';
    blocks['2,2,2'] = 'wood';
    blocks['-2,1,-2'] = 'sand';
    
    room.collection('world').create({
      blocks: blocks
    }).then(world => {
      console.log('Initial world created');
      // The subscribe handler will take care of rendering
    }).catch(err => {
      console.error('Failed to create initial world:', err);
      document.getElementById('loading').style.display = 'none';
    });
  }
  
  renderWorld() {
    // Clear existing blocks
    this.blockMeshes.forEach(mesh => {
      this.scene.remove(mesh);
    });
    
    this.blockMeshes = [];
    this.blockMap = {};
    
    // Render blocks from worldData
    if (this.worldData && this.worldData.blocks) {
      Object.entries(this.worldData.blocks).forEach(([position, type]) => {
        const [x, y, z] = position.split(',').map(Number);
        const blockPosition = new THREE.Vector3(x, y, z);
        this.createBlockMesh(blockPosition, type);
      });
    }
  }
  
  createBlockMesh(position, type) {
    const blockType = BlockTypes[type] || BlockTypes.stone;
    
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color: blockType.color });
    
    const blockMesh = new THREE.Mesh(geometry, material);
    blockMesh.position.copy(position);
    blockMesh.castShadow = true;
    blockMesh.receiveShadow = true;
    
    // Store reference to this position
    blockMesh.userData.position = position.clone();
    blockMesh.userData.type = type;
    
    this.scene.add(blockMesh);
    this.blockMeshes.push(blockMesh);
    
    // Update block map
    const key = `${position.x},${position.y},${position.z}`;
    this.blockMap[key] = blockMesh;
    
    return blockMesh;
  }
  
  addBlock(position, type, room) {
    const key = `${position.x},${position.y},${position.z}`;
    
    // Check if a block already exists at this position
    if (this.blockMap[key]) {
      return;
    }
    
    // Check if we have world data
    if (!this.worldData) return;
    
    // Create local block
    this.createBlockMesh(position, type);
    
    // Update local world data
    const blocks = { ...this.worldData.blocks };
    blocks[key] = type;
    
    // Update server world data
    room.collection('world').update(this.worldData.id, {
      blocks: blocks
    }).then(updatedWorld => {
      this.worldData = updatedWorld;
    }).catch(err => {
      console.error('Failed to update world:', err);
    });
  }
  
  removeBlock(position, room) {
    const key = `${position.x},${position.y},${position.z}`;
    
    // Check if we have a block at this position
    if (!this.blockMap[key]) {
      return;
    }
    
    // Check if we have world data
    if (!this.worldData) return;
    
    // Remove local block
    const blockMesh = this.blockMap[key];
    this.scene.remove(blockMesh);
    this.blockMeshes = this.blockMeshes.filter(mesh => mesh !== blockMesh);
    delete this.blockMap[key];
    
    // Update local world data
    const blocks = { ...this.worldData.blocks };
    delete blocks[key];
    
    // Update server world data
    room.collection('world').update(this.worldData.id, {
      blocks: blocks
    }).then(updatedWorld => {
      this.worldData = updatedWorld;
    }).catch(err => {
      console.error('Failed to update world:', err);
    });
  }
  
  snapToGrid(position) {
    return new THREE.Vector3(
      Math.floor(position.x + 0.5),
      Math.floor(position.y + 0.5),
      Math.floor(position.z + 0.5)
    );
  }
  
  getBlockPosition(blockMesh) {
    return blockMesh.userData.position.clone();
  }
}