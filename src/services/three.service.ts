import { Injectable, OnDestroy, signal, inject, effect } from '@angular/core';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Enemy } from '../models/simulation.model';
import { SimulationService } from './simulation.service';
import { ASSET_MANIFEST, AssetDefinition } from '../config/asset-manifest';
import { SceneCustomizationService, ThemeDefinition } from './scene-customization.service';

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

interface GravityWellEffect extends VisualEffect {
    particles: Particle[];
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  // For gravity well particles
  angle?: number;
  radius?: number;
  center?: THREE.Vector3;
}

@Injectable()
export class ThreeService implements OnDestroy {
  private simulationService = inject(SimulationService);
  private sceneCustomizationService = inject(SceneCustomizationService);

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
  private leftWall!: THREE.Mesh;
  private rightWall!: THREE.Mesh;
  private decorationsGroup!: THREE.Group;
  private torchLights: THREE.PointLight[] = [];

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();

  private projectiles: Projectile[] = [];
  activeGravityProjectile = signal<Projectile | null>(null);
  private visualEffects: (VisualEffect | GravityWellEffect)[] = [];
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
      const theme = this.sceneCustomizationService.activeThemeDefinition();
      if (this.scene && theme) {
        this.applyTheme(theme);
      }
    });

    effect(() => {
      const state = this.simulationService.gameState();
      if ((state === 'lost' || state === 'creation') && this.controls?.isLocked) {
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
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    
    this.decorationsGroup = new THREE.Group();
    this.scene.add(this.decorationsGroup);

    this.scene.add(new THREE.HemisphereLight(0x445588, 0x111122, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.2); // Moonlight
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    this.scene.add(dirLight);
    
    const groundMat = new THREE.MeshLambertMaterial();
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 80), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    
    const wallGeo = new THREE.BoxGeometry(1, 4, 80);
    const wallMat = new THREE.MeshLambertMaterial();
    this.leftWall = new THREE.Mesh(wallGeo, wallMat);
    this.leftWall.position.set(-5.5, 2, 0);
    this.scene.add(this.leftWall);
    this.rightWall = new THREE.Mesh(wallGeo, wallMat.clone());
    this.rightWall.position.set(5.5, 2, 0);
    this.scene.add(this.rightWall);

    this.magicProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, emissive: 0x88ffff, emissiveIntensity: 2 });
    this.fireProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0xffa500, emissive: 0xff4500, emissiveIntensity: 2 });
    this.gravityProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0x9400D3, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });

    await this._preloadAllModels();
    this.modelsLoaded.set(true);

    this.controls = new PointerLockControls(this.camera, canvas);

    canvas.addEventListener('click', this.onClick);
    this.controls.addEventListener('lock', () => this.controlsLocked.set(true));
    this.controls.addEventListener('unlock', () => this.controlsLocked.set(false));
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
  }

  private applyTheme(theme: ThemeDefinition) {
    // 1. Sky Color
    this.scene.background = theme.skyColor;

    // 2. Textures
    this.textureLoader.load(theme.floor, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(10, 80);
        (this.ground.material as THREE.MeshLambertMaterial).map = t;
        (this.ground.material as THREE.MeshLambertMaterial).needsUpdate = true;
    });
    this.textureLoader.load(theme.wall, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1, 20);
        (this.leftWall.material as THREE.MeshLambertMaterial).map = t;
        (this.leftWall.material as THREE.MeshLambertMaterial).needsUpdate = true;
        (this.rightWall.material as THREE.MeshLambertMaterial).map = t.clone();
        (this.rightWall.material as THREE.MeshLambertMaterial).needsUpdate = true;
    });

    // 3. Decorations
    this._clearDecorations();
    if (!theme.decorations) return;

    theme.decorations.forEach(decDef => {
      if (!decDef.url) return;
      this.loader.load(
        decDef.url,
        (gltf) => { // onSuccess
            const model = gltf.scene;
            this._normalizeAndCenterModel(model);
            decDef.positions.forEach(p => {
              const instance = model.clone();
              instance.scale.setScalar(decDef.scale);
              instance.position.set(p.pos[0], p.pos[1], p.pos[2]);
              instance.rotation.y = p.rotY;
              this.decorationsGroup.add(instance);
            });
        },
        undefined, // onProgress
        (error) => { // onError
          console.error(`Failed to load decoration asset ${decDef.url}`, error);
        }
      );
    });
  }

  private _clearDecorations() {
    while(this.decorationsGroup.children.length > 0) {
        const obj = this.decorationsGroup.children[0];
        this.disposeObject(obj);
        this.decorationsGroup.remove(obj);
    }
  }
  
  private async _preloadAllModels(): Promise<void> {
    const loadPromises = ASSET_MANIFEST.map(async (definition) => {
        if (!definition.url || !definition.url.startsWith('https') || !definition.url.endsWith('.glb')) {
             console.warn(`AssetManager: Skipping invalid manifest URL during preload: ${definition.url}`);
             return;
        }

        try {
            const gltf = await this.loader.loadAsync(definition.url);
            const model = gltf.scene;
            this._normalizeAndCenterModel(model);
            (model.userData as any).animations = gltf.animations;
            this.preloadedModels.set(definition.url, { model, definition });
        } catch (err) {
            console.error(`GLTFLoader failed for: ${definition.url}`, err);
        }
    });
    await Promise.all(loadPromises);
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
      this.enemyMixers.forEach(mixer => mixer.update(delta));
      this.updateMovement(delta);
      this.updateProjectiles(delta, elapsedTime);
      this.updateTargeting();
      this.simulationService.tick({ x: this.camera.position.x, y: this.camera.position.z, z: this.camera.position.y });
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

    const playerPosition = this.camera.position;
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
        
        // Handle collision for non-gravity spells
        if (p.type !== 'gravity') {
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
        const maxLife = p.type === 'gravity' ? 10 : 5; // Gravity projectiles live longer
        if (elapsedTime - p.spawnTime > maxLife) {
            shouldBeRemoved = true;
        }

        if (shouldBeRemoved) {
            if (p.light) p.light.dispose();
            this.disposeObject(p.mesh);
            this.scene.remove(p.mesh);
            this.projectiles.splice(i, 1);
            if(p === this.activeGravityProjectile()) this.activeGravityProjectile.set(null);
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
            // Gravity well particles have special movement
            if (p.angle !== undefined && p.radius !== undefined && p.center) {
                p.angle += 2 * delta; // rotation speed
                p.radius -= 1.5 * delta; // pull-in speed
                p.mesh.position.x = p.center.x + Math.cos(p.angle) * p.radius;
                p.mesh.position.z = p.center.z + Math.sin(p.angle) * p.radius;
            } else {
                 p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
            }
            p.mesh.scale.multiplyScalar(1 - delta * 2);
        }
    }
  }

  private createGravityWellEffect(position: THREE.Vector3) {
    const RADIUS = 7.0;
    const geometry = new THREE.SphereGeometry(RADIUS, 32, 32);
    const material = new THREE.MeshBasicMaterial({
        color: 0x9400D3,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    const effectMesh = new THREE.Mesh(geometry, material);
    effectMesh.position.copy(position);
    this.scene.add(effectMesh);

    const effectParticles: Particle[] = [];
    const particleGeo = new THREE.SphereGeometry(0.08, 4, 4);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xeeeeff });

    for (let i = 0; i < 60; i++) {
        const mesh = new THREE.Mesh(particleGeo, particleMat);
        const radius = Math.random() * RADIUS;
        const angle = Math.random() * Math.PI * 2;
        mesh.position.set(
            position.x + Math.cos(angle) * radius,
            position.y,
            position.z + Math.sin(angle) * radius
        );
        this.scene.add(mesh);
        const p: Particle = {
            mesh,
            velocity: new THREE.Vector3(),
            life: 4.0,
            angle,
            radius,
            center: position,
        };
        effectParticles.push(p);
        this.particles.push(p); // Add to main particle update loop
    }

    this.visualEffects.push({
        mesh: effectMesh,
        startTime: this.clock.getElapsedTime(),
        duration: 4.0, // Match the status effect duration
        initialScale: 0.1,
        endScale: 1.0,
        particles: effectParticles
    } as GravityWellEffect);
  }

  private updateSpecialEffects = (delta: number, elapsedTime: number) => {
    for (let i = this.visualEffects.length - 1; i >= 0; i--) {
        const effect = this.visualEffects[i];
        const effectAge = elapsedTime - effect.startTime;
        if (effectAge >= effect.duration) {
            this.scene.remove(effect.mesh);
            this.disposeObject(effect.mesh);
            // Particles are removed by the main particle loop when their life ends
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
  
  private detonateGravityWell(projectile: Projectile) {
      const wellPosition = projectile.mesh.position;
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

      // Clean up the projectile immediately
      const pIndex = this.projectiles.indexOf(projectile);
      if (pIndex > -1) this.projectiles.splice(pIndex, 1);
      
      if (projectile.light) projectile.light.dispose();
      this.disposeObject(projectile.mesh);
      this.scene.remove(projectile.mesh);
      this.activeGravityProjectile.set(null);
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
      return;
    }

    if (!this.controls.isLocked) {
        this.controls.lock();
        return;
    }

    this.wandRecoil = 0.2;
    const spellType = this.currentSpell();

    // --- New Gravity Spell Logic ---
    if (spellType === 'gravity' && this.activeGravityProjectile()) {
        this.detonateGravityWell(this.activeGravityProjectile()!);
        return;
    }

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
        this.activeGravityProjectile.set(newProjectile);
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

    // A reusable function to create a fallback visual for enemies whose models failed to load.
    const createFallbackVisual = (targetGroup: THREE.Group) => {
        console.warn(`Creating fallback placeholder for enemy ${targetGroup.userData['enemyId']}.`);
        const fallbackGeo = new THREE.BoxGeometry(0.7, 1.2, 0.7); // Sized like a creature
        const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x330000 });
        const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
        fallbackMesh.position.y = 1.2 / 2; // Position so its base is on the ground
        fallbackMesh.castShadow = true;
        targetGroup.add(fallbackMesh);

        // Also setup a health bar for the fallback to prevent crashes in the render loop.
        const healthBarGroup = new THREE.Group();
        healthBarGroup.position.y = 1.2 + 0.2; // Position above the box
        const BAR_WIDTH = 0.8;
        const BAR_HEIGHT = 0.1;
        const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT), new THREE.MeshBasicMaterial({ color: 0xcc0000, side: THREE.DoubleSide }));
        const fgMesh = new THREE.Mesh(new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT), new THREE.MeshBasicMaterial({ color: 0x00cc00, side: THREE.DoubleSide }));
        fgMesh.position.z = 0.001;
        healthBarGroup.add(bgMesh, fgMesh);
        targetGroup.add(healthBarGroup);
        (targetGroup.userData as any).healthBar = fgMesh;
        (targetGroup.userData as any).healthBarContainer = healthBarGroup;
        (targetGroup.userData as any).BAR_WIDTH = BAR_WIDTH;
    };

    for (const enemy of enemies) {
        let enemyObject = this.enemyObjects.get(enemy.id);
        
        if (!enemyObject) {
            // --- Create a new enemy object ---
            const containerGroup = new THREE.Group();
            containerGroup.userData['enemyId'] = enemy.id;
            this.enemyObjects.set(enemy.id, containerGroup);
            this.scene.add(containerGroup);
            enemyObject = containerGroup;

            const modelUrl = enemy.modelUrl;
            const preloadedData = modelUrl ? this.preloadedModels.get(modelUrl) : undefined;

            if (preloadedData) {
                // SUCCESS: Model was preloaded, so create the real visual
                const modelData = preloadedData;
                const modelInstance = modelData.model.clone();
                enemyObject.add(modelInstance);

                enemyObject.traverse(c => {
                    c.userData['enemyId'] = enemy.id;
                    if ((c as THREE.Mesh).isMesh) {
                        c.castShadow = true;
                        (c as THREE.Mesh).material = (c as THREE.Mesh).material.clone();
                    }
                });

                // Setup animations
                const animations = (modelData.model.userData as any).animations as THREE.AnimationClip[];
                if (animations?.length) {
                    const mixer = new THREE.AnimationMixer(enemyObject);
                    this.enemyMixers.set(enemy.id, mixer);
                    const runClipName = modelData.definition.animations.run;
                    if (runClipName !== 'none') {
                        const clip = THREE.AnimationClip.findByName(animations, runClipName) || animations.find(c => c.name.toLowerCase().includes('walk')) || animations[0];
                        if (clip) mixer.clipAction(clip).play();
                    }
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
                enemyObject.add(healthBarGroup);
                (enemyObject.userData as any).healthBar = foregroundMesh;
                (enemyObject.userData as any).healthBarContainer = healthBarGroup;
                (enemyObject.userData as any).BAR_WIDTH = BAR_WIDTH;

            } else {
                // FAILURE: Model was not preloaded, create a fallback visual
                createFallbackVisual(enemyObject);
            }
        }
        
        // --- Update existing enemy objects (both real and fallback) ---
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
                    material.emissive.set(isBurning ? 0xffa500 : 0x000000);
                    material.emissiveIntensity = isBurning ? 0.8 : 0;
                }
            }
        });

        enemyObject.position.set(enemy.position.x, enemy.position.z, enemy.position.y);
        
        const playerPosition = this.camera.position;
        const dx = playerPosition.x - enemyObject.position.x;
        const dz = playerPosition.z - enemyObject.position.z;
        enemyObject.rotation.y = Math.atan2(dx, dz) + Math.PI;
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