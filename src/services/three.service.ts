import { Injectable, OnDestroy, signal, inject, effect } from '@angular/core';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Enemy } from '../models/simulation.model';
import { SimulationService } from './simulation.service';
import { ASSET_MANIFEST, AssetDefinition } from '../config/asset-manifest';
import { AssetManagerService } from './asset-manager.service';

type SpellType = 'magic' | 'fire' | 'gravity';

interface Projectile {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  spawnTime: number;
  type: SpellType;
  light?: THREE.PointLight;
}

interface VisualEffect {
    mesh: THREE.Mesh;
    startTime: number;
    duration: number;
    initialScale: number;
    endScale: number;
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

@Injectable()
export class ThreeService implements OnDestroy {
  private simulationService = inject(SimulationService);
  private assetManagerService = inject(AssetManagerService);

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private viewModelScene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: PointerLockControls;
  private frameId: number | null = null;
  private clock = new THREE.Clock();
  private loader!: GLTFLoader;
  private textureLoader!: THREE.TextureLoader;
  private cubeTextureLoader!: THREE.CubeTextureLoader;
  private raycaster!: THREE.Raycaster;

  private enemyObjects = new Map<string, THREE.Group>();
  private enemyMixers = new Map<string, THREE.AnimationMixer>();
  
  private preloadedModels = new Map<string, { model: THREE.Group, definition: AssetDefinition }>();
  modelsLoaded = signal(false);

  private ground!: THREE.Mesh;
  private torchLights: THREE.PointLight[] = [];

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();

  private projectiles: Projectile[] = [];
  private activeGravityProjectile: Projectile | null = null;
  private visualEffects: VisualEffect[] = [];
  private particles: Particle[] = [];
  private magicProjectileMaterial!: THREE.MeshBasicMaterial;
  private fireProjectileMaterial!: THREE.MeshBasicMaterial;
  private gravityProjectileMaterial!: THREE.MeshBasicMaterial;

  private wand?: THREE.Group;
  private wandBasePosition = new THREE.Vector3();
  private wandRecoil = 0;
  private wandTip?: THREE.Mesh;
  private wandLight?: THREE.PointLight;

  controlsLocked = signal(false);
  currentSpell = signal<SpellType>('magic');
  targetedEnemy = signal<Enemy | null>(null);

  constructor() {
    effect(() => {
        const spell = this.currentSpell();
        if (this.wandTip && this.wandLight) {
            if (spell === 'magic') {
                (this.wandTip.material as THREE.MeshBasicMaterial).color.set(0x00ffff);
                this.wandLight.color.set(0x00ffff);
            } else if (spell === 'gravity') {
                (this.wandTip.material as THREE.MeshBasicMaterial).color.set(0x9400D3);
                this.wandLight.color.set(0x9400D3);
            } else { // fire
                (this.wandTip.material as THREE.MeshBasicMaterial).color.set(0xffa500);
                this.wandLight.color.set(0xffa500);
            }
        }
    });

    effect(() => {
      const state = this.simulationService.gameState();
      if ((state === 'won' || state === 'lost' || state === 'menu') && this.controls?.isLocked) {
        this.controls.unlock();
      }
    });
  }

  async initialize(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.viewModelScene = new THREE.Scene();
    this.loader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
    this.raycaster = new THREE.Raycaster();

    this.camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 2000);
    this.camera.position.set(0, 1.0, 39);

    this.wand = new THREE.Group();
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0x4a2a0a });
    const shaftGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.6, 8);
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    this.wand.add(shaft);
    
    const tipMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 2 });
    this.wandTip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), tipMat);
    this.wandTip.position.y = 0.32;
    this.wand.add(this.wandTip);
    
    this.wandLight = new THREE.PointLight(0x00ffff, 10, 2);
    this.wandLight.position.y = 0.32;
    this.wand.add(this.wandLight);
    
    this.wand.position.set(0.3, -0.4, -0.7);
    this.wand.rotation.set(-Math.PI / 10, Math.PI / 6, Math.PI / 5);
    this.camera.add(this.wand);
    this.wandBasePosition.copy(this.wand.position);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    
    this.scene.background = new THREE.Color(0x1a1a2a); // Dark blue night sky

    this.scene.add(new THREE.HemisphereLight(0x445588, 0x111122, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.2); // Moonlight
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    this.scene.add(dirLight);
    
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a4a4a }); // A dark grey base for the stone
    this.textureLoader.load('https://cc0-textures.s3.us-east-2.amazonaws.com/PavingStones12/PavingStones12_Color.jpg', 
      (t) => { // onLoad
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(10, 80);
        groundMat.map = t;
        groundMat.needsUpdate = true;
      },
      undefined, // onProgress
      (err) => { // onError
        console.error('An error occurred loading the ground texture:', err);
      }
    );
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 80), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    
    const wallGeo = new THREE.BoxGeometry(1, 4, 80);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.position.set(-5.5, 2, 0);
    this.scene.add(leftWall);
    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.position.set(5.5, 2, 0);
    this.scene.add(rightWall);
    
    await this._initializeScenery();

    this.magicProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, emissive: 0x88ffff, emissiveIntensity: 2 });
    this.fireProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0xffa500, emissive: 0xff4500, emissiveIntensity: 2 });
    this.gravityProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0x9400D3, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });

    await this._preloadAllModels();
    this.modelsLoaded.set(true);

    this.controls = new PointerLockControls(this.camera, canvas);
    this.scene.add(this.controls.getObject());

    canvas.addEventListener('click', this.onClick);
    this.controls.addEventListener('lock', () => this.controlsLocked.set(true));
    this.controls.addEventListener('unlock', () => this.controlsLocked.set(false));
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
  }
  
  private async _preloadAllModels(): Promise<void> {
    const loadPromises = ASSET_MANIFEST.map(async (definition) => {
        const isValid = await this.assetManagerService.resolveModelUrl(definition.url);
        if (isValid) {
            try {
                const gltf = await this.loader.loadAsync(definition.url);
                const model = gltf.scene;
                this._normalizeAndCenterModel(model);
                (model.userData as any).animations = gltf.animations;
                this.preloadedModels.set(definition.url, { model, definition });
            } catch (err) {
                console.error(`GLTFLoader failed even after URL validation for: ${definition.url}`, err);
            }
        } else {
             console.warn(`AssetManager: Skipping invalid manifest URL during preload: ${definition.url}`);
        }
    });
    await Promise.all(loadPromises);
  }

  private async _initializeScenery() {
    try {
        const url = 'https://raw.githubusercontent.com/quaternius/Ultimate-Props-Pack-1/main/GLB/WallLamp.glb';
        const validUrl = await this.assetManagerService.resolveModelUrl(url);
        if (!validUrl) {
          console.error("Scenery model URL is invalid, skipping scenery initialization.");
          return;
        }

        const gltf = await this.loader.loadAsync(validUrl);
        const lampModel = gltf.scene;
        lampModel.scale.set(1.0, 1.0, 1.0);

        const spacing = 8;
        const worldHalfLength = 40;

        for (let z = -worldHalfLength + spacing; z < worldHalfLength; z += spacing) {
            // Left Wall Lamp
            const leftLamp = lampModel.clone();
            leftLamp.position.set(-5.2, 2.5, z);
            const leftLight = new THREE.PointLight(0xffaa33, 8, 7);
            leftLight.castShadow = true;
            leftLight.position.set(0, -0.2, 0.4);
            leftLamp.add(leftLight);
            this.torchLights.push(leftLight);
            this.scene.add(leftLamp);

            // Right Wall Lamp
            const rightLamp = lampModel.clone();
            rightLamp.position.set(5.2, 2.5, z);
            rightLamp.rotation.y = Math.PI;
            const rightLight = new THREE.PointLight(0xffaa33, 8, 7);
            rightLight.castShadow = true;
            rightLight.position.set(0, -0.2, 0.4);
            rightLamp.add(rightLight);
            this.torchLights.push(rightLight);
            this.scene.add(rightLamp);
        }
    } catch (e) {
        console.error("Failed to load scenery model", e);
    }
  }

  animate = () => {
    this.frameId = requestAnimationFrame(this.animate);
    const canvas = this.renderer.domElement;
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
        this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
        this.camera.updateProjectionMatrix();
    }
    
    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();
    const gameState = this.simulationService.gameState();

    if (gameState === 'running') {
      this.simulationService.tick(this.controls.getObject().position);
      this.enemyMixers.forEach(mixer => mixer.update(delta));
      this.updateMovement(delta);
      this.updateProjectiles(delta, elapsedTime);
      this.updateTargeting();
    } else {
      this.targetedEnemy.set(null);
    }
    
    this.updateWandRecoil(delta);
    this.updateSpecialEffects(delta, elapsedTime);
    this.updateParticles(delta);
    this.updateTorches();
    
    this.enemyObjects.forEach(enemyObject => {
        const healthBarContainer = (enemyObject.userData as any).healthBarContainer as THREE.Group;
        if (healthBarContainer) {
            healthBarContainer.quaternion.copy(this.camera.quaternion);
        }
    });

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.viewModelScene, this.camera);
  };

  private updateTorches() {
    const time = this.clock.getElapsedTime();
    this.torchLights.forEach((light, i) => {
        const flicker = Math.sin(time * 5 + i * 2.1) * 0.5 + Math.sin(time * 3.3 + i * 3.4) * 0.5;
        light.intensity = 6 + flicker * 2; // Base intensity 6, flicker between 4 and 8
    });
  }

  private updateTargeting() {
    if (!this.controlsLocked()) {
      this.targetedEnemy.set(null);
      return;
    }
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const intersects = this.raycaster.intersectObjects([...this.enemyObjects.values()], true);

    if (intersects.length > 0) {
      let intersectedObject = intersects[0].object;
      while(intersectedObject.parent && !intersectedObject.userData['enemyId']) {
        intersectedObject = intersectedObject.parent;
      }
      const enemyId = intersectedObject.userData['enemyId'];
      if(enemyId) {
        const enemyData = this.simulationService.enemies().get(enemyId);
        this.targetedEnemy.set(enemyData ?? null);
      } else {
        this.targetedEnemy.set(null);
      }
    } else {
      this.targetedEnemy.set(null);
    }
  }
  
  private updateMovement = (delta: number) => {
    if (!this.controls.isLocked) {
      this.velocity.x -= this.velocity.x * 10.0 * delta;
      this.velocity.z -= this.velocity.z * 10.0 * delta;
      return;
    };

    const speed = 40.0;
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * speed * delta;
    if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * speed * delta;

    this.controls.moveRight(-this.velocity.x * delta);
    this.controls.moveForward(-this.velocity.z * delta);

    const playerPosition = this.controls.getObject().position;
    const halfWidth = 4.5;
    const halfLength = 39.5;
    playerPosition.x = Math.max(-halfWidth, Math.min(halfWidth, playerPosition.x));
    playerPosition.z = Math.max(-halfLength, Math.min(halfLength, playerPosition.z));
    playerPosition.y = 1.0;
  }

  private updateWandRecoil(delta: number) {
    if (this.wandRecoil > 0) {
      this.wandRecoil -= delta * 2;
    } else {
      this.wandRecoil = 0;
    }
    if(this.wand) {
      this.wand.position.z = this.wandBasePosition.z - this.wandRecoil;
    }
  }

  private updateProjectiles = (delta: number, elapsedTime: number) => {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));

        let shouldBeRemoved = false;
        
        // Handle detonation for gravity spell
        if (p.type === 'gravity') {
            if (elapsedTime - p.spawnTime > 1.5) { // Detonate after 1.5 seconds
                const wellPosition = p.mesh.position;
                const wellCenterForWorker = { x: wellPosition.x, y: wellPosition.z, z: wellPosition.y };
                
                this.simulationService.applyAreaStatusEffect(
                    wellCenterForWorker,
                    7.0, // Radius of effect
                    { 
                        type: 'gravity', 
                        duration: 240, // 4 seconds at 60tps
                        force: 0.08, // pull strength
                        center: wellCenterForWorker
                    }
                );
                this.createGravityWellEffect(wellPosition);
                this.createGravityDetonationEffect(wellPosition);
                shouldBeRemoved = true;
            }
        } else { // Handle collision for other spells
            for (const [id, enemyObject] of this.enemyObjects.entries()) {
                const enemyBox = new THREE.Box3().setFromObject(enemyObject);
                if (enemyBox.containsPoint(p.mesh.position)) {
                    this.simulationService.damageEnemy(id, p.type === 'fire' ? 35 : 25);
                    if(p.type === 'fire') {
                        this.simulationService.damageEnemy(id, 0, { type: 'burning', duration: 180, damagePerTick: 0.1 });
                    }
                    this.createImpactEffect(p.mesh.position, p.type);
                    shouldBeRemoved = true;
                    break;
                }
            }
        }
        
        // Time-based removal for all projectiles
        if (elapsedTime - p.spawnTime > 5) {
            shouldBeRemoved = true;
        }

        if (shouldBeRemoved) {
            if (p.light) p.light.dispose();
            this.disposeObject(p.mesh);
            this.scene.remove(p.mesh);
            this.projectiles.splice(i, 1);
            if(p === this.activeGravityProjectile) this.activeGravityProjectile = null;
        }
    }
  }
  
  private createImpactEffect(position: THREE.Vector3, type: SpellType) {
    let color: THREE.Color;
    switch(type) {
        case 'magic': color = new THREE.Color(0x00ffff); break;
        case 'fire': color = new THREE.Color(0xffa500); break;
        case 'gravity': color = new THREE.Color(0x9400D3); break;
    }

    const particleCount = 20;
    const geometry = new THREE.SphereGeometry(0.05, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color });

    for (let i = 0; i < particleCount; i++) {
        const particleMesh = new THREE.Mesh(geometry, material);
        particleMesh.position.copy(position);
        this.scene.add(particleMesh);
        this.particles.push({
            mesh: particleMesh,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5
            ),
            life: Math.random() * 0.5 + 0.3 // 0.3 to 0.8 seconds
        });
    }
  }

  private createGravityDetonationEffect(position: THREE.Vector3) {
    const particleCount = 50;
    const geometry = new THREE.SphereGeometry(0.1, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0x9400D3 });

    for (let i = 0; i < particleCount; i++) {
        const particleMesh = new THREE.Mesh(geometry, material);
        particleMesh.position.copy(position);
        this.scene.add(particleMesh);
        
        const phi = Math.random() * Math.PI * 2;
        const costheta = Math.random() * 2 - 1;
        const theta = Math.acos(costheta);
        const speed = Math.random() * 6 + 2;

        const velocity = new THREE.Vector3();
        velocity.setFromSphericalCoords(speed, phi, theta);

        this.particles.push({
            mesh: particleMesh,
            velocity,
            life: Math.random() * 1.0 + 0.5 // 0.5 to 1.5 seconds
        });
    }
  }
  
  private updateParticles = (delta: number) => {
    for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= delta;
        if (p.life <= 0) {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            (p.mesh.material as THREE.Material).dispose();
            this.particles.splice(i, 1);
        } else {
            p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
            p.mesh.scale.multiplyScalar(1 - delta * 2);
        }
    }
  }

  private createGravityWellEffect(position: THREE.Vector3) {
    const geometry = new THREE.SphereGeometry(7.0, 32, 32);
    const material = new THREE.MeshBasicMaterial({
        color: 0x9400D3,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    const effectMesh = new THREE.Mesh(geometry, material);
    effectMesh.position.copy(position);
    this.scene.add(effectMesh);

    this.visualEffects.push({
        mesh: effectMesh,
        startTime: this.clock.getElapsedTime(),
        duration: 4.0, // Match the status effect duration
        initialScale: 0.1,
        endScale: 1.0
    });
  }

  private updateSpecialEffects = (delta: number, elapsedTime: number) => {
    for (let i = this.visualEffects.length - 1; i >= 0; i--) {
        const effect = this.visualEffects[i];
        const effectAge = elapsedTime - effect.startTime;
        if (effectAge >= effect.duration) {
            this.scene.remove(effect.mesh);
            this.disposeObject(effect.mesh);
            this.visualEffects.splice(i, 1);
        } else {
            const progress = effectAge / effect.duration;
            // A quick expand then fade out effect
            const scale = effect.initialScale + (effect.endScale - effect.initialScale) * Math.sin(progress * Math.PI); // Sin wave for expand/contract
            effect.mesh.scale.set(scale, scale, scale);
            (effect.mesh.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - progress);
        }
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.moveForward = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.moveLeft = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.moveBackward = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveRight = true;
        break;
      case 'Digit1':
        this.currentSpell.set('magic');
        break;
      case 'Digit2':
        this.currentSpell.set('fire');
        break;
      case 'Digit3':
        this.currentSpell.set('gravity');
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.moveForward = false;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.moveLeft = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.moveBackward = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveRight = false;
        break;
    }
  };

  private onClick = () => {
    const gameState = this.simulationService.gameState();
    if (gameState !== 'running') {
      if (gameState === 'menu') {
        this.simulationService.startGame();
        this.controls.lock();
      }
      return;
    }

    if (!this.controls.isLocked) {
        this.controls.lock();
        return;
    }

    this.wandRecoil = 0.2;

    const spellType = this.currentSpell();
    const projectileGeometry = new THREE.SphereGeometry(spellType === 'gravity' ? 0.2 : 0.1, 8, 8);
    let projectileMaterial;
    switch(spellType) {
        case 'magic': projectileMaterial = this.magicProjectileMaterial; break;
        case 'fire': projectileMaterial = this.fireProjectileMaterial; break;
        case 'gravity': projectileMaterial = this.gravityProjectileMaterial; break;
    }

    const projectileMesh = new THREE.Group();
    const core = new THREE.Mesh(projectileGeometry, projectileMaterial);
    projectileMesh.add(core);

    const light = new THREE.PointLight((projectileMaterial as any).color, 5, 5);
    projectileMesh.add(light);

    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    
    const projectileVelocity = cameraDirection.clone().multiplyScalar(50);
    
    const startPosition = this.camera.position.clone().add(cameraDirection.multiplyScalar(0.5));
    projectileMesh.position.copy(startPosition);

    this.scene.add(projectileMesh);
    const newProjectile: Projectile = {
        mesh: projectileMesh,
        velocity: projectileVelocity,
        spawnTime: this.clock.getElapsedTime(),
        type: spellType,
        light,
    };
    this.projectiles.push(newProjectile);

    if (spellType === 'gravity') {
        this.activeGravityProjectile = newProjectile;
    }
  }
  
  private _normalizeAndCenterModel(model: THREE.Group) {
    // 1. Calculate bounding box
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // 2. Center the model's geometry at its local origin
    model.position.sub(center);

    // 3. Normalize the model's size
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 1e-5) { // Avoid division by zero for empty models
      const scale = 1.0 / maxDim;
      model.scale.multiplyScalar(scale);
    }

    // 4. Reposition model to sit on the ground (y=0)
    // We need to re-calculate the bounding box after our transformations
    const newBox = new THREE.Box3().setFromObject(model);
    model.position.y -= newBox.min.y;
  }

  updateEnemies(enemies: Enemy[]) {
    if (!this.scene || !this.modelsLoaded()) return;
    const activeEnemyIds = new Set(enemies.map(e => e.id));

    for (const enemy of enemies) {
        let enemyObject = this.enemyObjects.get(enemy.id);
        
        if (!enemyObject) {
            // Create a container group for the enemy. It will be populated asynchronously.
            const containerGroup = new THREE.Group();
            containerGroup.userData['enemyId'] = enemy.id;
            
            this.enemyObjects.set(enemy.id, containerGroup);
            this.scene.add(containerGroup);
            enemyObject = containerGroup;

            // --- Asynchronously load the real model (URL is guaranteed to be valid) ---
            const modelUrl = enemy.modelUrl;
            if (modelUrl) {
                const onModelLoaded = (modelData: { model: THREE.Group, definition: AssetDefinition }) => {
                    const existingObject = this.enemyObjects.get(enemy.id);
                    if (!existingObject) return; // Enemy might have been removed while model was loading

                    // Add the actual model's children to the container
                    const modelInstance = modelData.model.clone();
                    while(modelInstance.children.length > 0) {
                        existingObject.add(modelInstance.children[0]);
                    }

                    existingObject.traverse(c => {
                        c.userData['enemyId'] = enemy.id;
                        if ((c as THREE.Mesh).isMesh) {
                            c.castShadow = true;
                            // Ensure materials are unique to allow for individual effects like burning
                            (c as THREE.Mesh).material = (c as THREE.Mesh).material.clone();
                        }
                    });

                    // Setup animations
                    const animations = (modelData.model.userData as any).animations as THREE.AnimationClip[];
                    if (animations?.length) {
                        const mixer = new THREE.AnimationMixer(existingObject);
                        this.enemyMixers.set(enemy.id, mixer);
                        const runClipName = modelData.definition.animations.run;
                        const clip = THREE.AnimationClip.findByName(animations, runClipName) || animations.find(c => c.name.toLowerCase().includes('walk')) || animations[0];
                        if (clip) mixer.clipAction(clip).play();
                    }

                    // Setup health bar
                    const healthBarGroup = new THREE.Group();
                    healthBarGroup.position.y = enemy.genome.bodySize * (modelData.definition.scale || 1.0) * 1.2 + 0.2;
                    const BAR_WIDTH = 0.8;
                    const BAR_HEIGHT = 0.1;
                    const backgroundMesh = new THREE.Mesh( new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT), new THREE.MeshBasicMaterial({ color: 0xcc0000, side: THREE.DoubleSide }) );
                    const foregroundMesh = new THREE.Mesh( new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT), new THREE.MeshBasicMaterial({ color: 0x00cc00, side: THREE.DoubleSide }) );
                    foregroundMesh.position.z = 0.001;
                    healthBarGroup.add(backgroundMesh, foregroundMesh);
                    existingObject.add(healthBarGroup);
                    (existingObject.userData as any).healthBar = foregroundMesh;
                    (existingObject.userData as any).healthBarContainer = healthBarGroup;
                    (existingObject.userData as any).BAR_WIDTH = BAR_WIDTH;
                };

                const preloadedData = this.preloadedModels.get(modelUrl);
                if (preloadedData) {
                    onModelLoaded(preloadedData);
                } else {
                    // This is a custom URL, validate and load it.
                    // Validation is for caching; factory already guaranteed it's a good URL.
                    this.assetManagerService.resolveModelUrl(modelUrl).then(validUrl => {
                        if (validUrl) {
                            this.loader.loadAsync(validUrl)
                                .then(gltf => {
                                    const model = gltf.scene;
                                    this._normalizeAndCenterModel(model);
                                    (model.userData as any).animations = gltf.animations;
                                    const definition: AssetDefinition = { id: 'custom', url: validUrl, types: [enemy.genomeType], animations: { run: 'run' }, scale: 1.0 };
                                    this.preloadedModels.set(validUrl, { model, definition });
                                    onModelLoaded({ model, definition });
                                })
                                .catch(err => {
                                    console.error(`Failed to load custom model ${validUrl}. Object will remain invisible.`, err);
                                });
                        }
                    });
                }
            }
        }
        
        const assetDef = this.preloadedModels.get(enemy.modelUrl!)?.definition;
        const baseScale = assetDef ? assetDef.scale : 1.0;
        enemyObject.scale.setScalar(enemy.genome.bodySize * baseScale);

        const healthBar = (enemyObject.userData as any).healthBar as THREE.Mesh;
        if (healthBar) {
            const healthPercent = enemy.health / enemy.maxHealth;
            healthBar.scale.x = Math.max(0, healthPercent);
            const BAR_WIDTH = (enemyObject.userData as any).BAR_WIDTH;
            healthBar.position.x = - (BAR_WIDTH * (1 - healthPercent)) / 2;
        }

        const isBurning = enemy.statusEffects.some(e => e.type === 'burning');
        enemyObject.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
                const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                if (material?.emissive) {
                    material.emissive.set(isBurning ? 0xff4500 : 0x000000);
                    material.emissiveIntensity = isBurning ? 0.5 : 0;
                }
            }
        });

        enemyObject.position.set(enemy.position.x, enemy.position.z, enemy.position.y);
        
        const playerPosition = this.controls.getObject().position;
        enemyObject.lookAt(playerPosition.x, enemyObject.position.y, playerPosition.z);
    }

    this.enemyObjects.forEach((object, id) => {
        if (!activeEnemyIds.has(id)) {
            this.disposeObject(object);
            this.scene.remove(object);
            this.enemyObjects.delete(id);
            this.enemyMixers.delete(id);
        }
    });
  }

  private disposeObject(object: THREE.Object3D) {
    object.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(material => material.dispose());
        } else {
          (mesh.material as THREE.Material).dispose();
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  cleanup(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    if(this.renderer) {
        this.renderer.domElement.removeEventListener('click', this.onClick);
        this.renderer.dispose();
    }
    if (this.controls) this.controls.dispose();
  }
}
