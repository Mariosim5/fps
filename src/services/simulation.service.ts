import { Injectable, signal, inject, OnDestroy } from '@angular/core';
import { Enemy, StatusEffect, EnemyTemplate } from '../models/simulation.model';
import { SIMULATION_WORKER_SCRIPT } from './simulation-worker.script';
import { ASSET_MANIFEST } from '../config/asset-manifest';
import { SceneCustomizationService } from './scene-customization.service';


@Injectable({
  providedIn: 'root',
})
export class SimulationService implements OnDestroy {
  private worker: Worker;
  private sceneCustomizationService = inject(SceneCustomizationService);

  // === Player State ===
  playerHealth = signal<number>(100);
  maxPlayerHealth = 100;

  // === Game State ===
  gameState = signal<'creation' | 'running' | 'lost'>('creation');
  
  // === Public State Signals ===
  enemies = signal<Map<string, Enemy>>(new Map());
  tickCounter = signal<number>(0);
  enemiesDefeated = signal<number>(0);

  constructor() {
    const blob = new Blob([SIMULATION_WORKER_SCRIPT], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob));

    this.worker.onmessage = ({ data }) => {
      const { type, payload } = data;

      switch(type) {
        case 'stateUpdate':
          this.enemies.set(new Map(payload.enemies.map((e: Enemy) => [e.id, e])));
          this.playerHealth.set(payload.playerHealth);
          this.enemiesDefeated.set(payload.enemiesDefeated);
          this.tickCounter.set(payload.tickCounter);
          break;
        case 'gameStateUpdate':
          this.gameState.set(payload);
          break;
        case 'requestReinforcement':
          this.requestReinforcement();
          break;
      }
    };
  }
  
  prepareGame() {
    this.gameState.set('creation');
    this.worker.postMessage({ type: 'init', payload: { assetManifest: ASSET_MANIFEST }});
  }

  startSimulation() {
    this.sceneCustomizationService.useRandomTheme();
    
    const presetTemplates: EnemyTemplate[] = ASSET_MANIFEST.map(asset => ({
      name: asset.id.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      genome: {
        bodySize: 1.0,
        speed: 0.03 + (Math.random() - 0.5) * 0.02,
        armor: 0.1 + (Math.random() - 0.5) * 0.1,
        numBuds: 0,
        budSizeVariation: 0,
        color: '#FFFFFF'
      },
      genomeType: asset.types[0],
      modelUrl: asset.url
    }));
    
    const count = 30;
    const templatesToUse = [];
    for (let i = 0; i < count; i++) {
      templatesToUse.push(presetTemplates[i % presetTemplates.length]);
    }
    
    this.worker.postMessage({ type: 'prepare', payload: { templates: templatesToUse, count: count }});
    this.worker.postMessage({ type: 'start' });
    this.gameState.set('running');
  }

  restart() {
    this.playerHealth.set(this.maxPlayerHealth);
    this.enemiesDefeated.set(0);
    this.tickCounter.set(0);
    this.sceneCustomizationService.resetToDefaultTheme();
    this.gameState.set('creation');
  }
  
  private requestReinforcement() {
    const randomAsset = ASSET_MANIFEST[Math.floor(Math.random() * ASSET_MANIFEST.length)];
    const template: EnemyTemplate = {
      name: randomAsset.id.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      genome: {
          bodySize: 1.0,
          speed: 0.03 + (Math.random() - 0.5) * 0.02,
          armor: 0.1 + (Math.random() - 0.5) * 0.1,
          numBuds: 0,
          budSizeVariation: 0,
          color: '#FFFFFF'
      },
      genomeType: randomAsset.types[0],
      modelUrl: randomAsset.url
    };

    this.worker.postMessage({ type: 'spawnEnemy', payload: template });
  }
  
  damageEnemy(id: string, damage: number, effect?: Omit<StatusEffect, 'startTime'>) {
    this.worker.postMessage({ type: 'damageEnemy', payload: { id, damage, effect }});
  }

  applyAreaStatusEffect(
    position: { x: number; y: number; z: number }, 
    radius: number, 
    effect: Omit<StatusEffect, 'startTime'>
  ) {
    this.worker.postMessage({ 
        type: 'applyAreaEffect', 
        payload: { position, radius, effect }
    });
  }

  tick(playerPosition: { x: number; y: number; z: number; }) {
    if (this.gameState() === 'running') {
      this.worker.postMessage({ type: 'tick', payload: playerPosition });
    }
  }

  ngOnDestroy() {
    this.worker.terminate();
  }
}
