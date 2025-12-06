import { Injectable, signal, inject, OnDestroy } from '@angular/core';
import { Enemy, StatusEffect } from '../models/simulation.model';
import { SIMULATION_WORKER_SCRIPT } from './simulation-worker.script';
import { ASSET_MANIFEST } from '../config/asset-manifest';
import { EnemyFactoryService, EnemyTemplate } from './enemy-factory.service';

@Injectable({
  providedIn: 'root',
})
export class SimulationService implements OnDestroy {
  private worker: Worker;
  private enemyFactory = inject(EnemyFactoryService);

  private aiGeneratedQueue: EnemyTemplate[] = [];
  private isGeneratingInBackground = false;

  // === Player State ===
  playerHealth = signal<number>(100);
  maxPlayerHealth = 100;

  // === Game State ===
  gameState = signal<'menu' | 'running' | 'lost'>('menu');
  
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
    
    this.worker.postMessage({ type: 'init', payload: { assetManifest: ASSET_MANIFEST }});
  }
  
  prepareAndStartGame() {
    this.gameState.set('menu');
    
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

    const initialTemplates: EnemyTemplate[] = [];
    for (let i = 0; i < 30; i++) {
        initialTemplates.push(presetTemplates[i % presetTemplates.length]);
    }
    
    this.worker.postMessage({ type: 'prepare', payload: { templates: initialTemplates, count: 30 }});

    this._startBackgroundGeneration();
  }

  startGame() {
    this.gameState.set('running');
    this.worker.postMessage({ type: 'start' });
  }

  restart() {
    this.stopBackgroundGeneration();
    this.aiGeneratedQueue = [];
    this.playerHealth.set(this.maxPlayerHealth);
    this.enemiesDefeated.set(0);
    this.tickCounter.set(0);
    // Reset worker state by re-preparing the game
    this.prepareAndStartGame();
    // The game state is already 'menu' from prepareAndStartGame
  }

  private async _startBackgroundGeneration() {
    if (this.isGeneratingInBackground) return;
    this.isGeneratingInBackground = true;

    console.log("Fucina Perpetua: Inizio generazione in background...");

    (async () => {
      while (this.isGeneratingInBackground) {
        try {
          const newTemplates = await this.enemyFactory.generateEnemyTemplates(1, () => {});
          if (newTemplates.length > 0 && this.isGeneratingInBackground) {
            console.log(`Fucina Perpetua: Nuovo Eidolon "${newTemplates[0].name}" forgiato. In coda: ${this.aiGeneratedQueue.length + 1}`);
            this.aiGeneratedQueue.push(newTemplates[0]);
          }
        } catch (error) {
          console.error("Fucina Perpetua: Errore durante la generazione in background. Riprovo tra 10 secondi.", error);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
      console.log("Fucina Perpetua: Generazione in background interrotta.");
    })();
  }
  
  private stopBackgroundGeneration() {
      this.isGeneratingInBackground = false;
  }
  
  private requestReinforcement() {
    let template: EnemyTemplate;

    if (this.aiGeneratedQueue.length > 0) {
      template = this.aiGeneratedQueue.shift()!;
      console.log(`Rinforzo: In arrivo un Eidolon forgiato dall'IA: "${template.name}"`);
    } else {
      console.log("Rinforzo: La fucina è occupata. Invio di un'unità predefinita.");
      const randomAsset = ASSET_MANIFEST[Math.floor(Math.random() * ASSET_MANIFEST.length)];
      template = {
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
    }

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
    if (this.gameState() !== 'running') return;
    this.worker.postMessage({ type: 'tick', payload: playerPosition });
  }

  ngOnDestroy(): void {
    this.stopBackgroundGeneration();
    this.worker.terminate();
  }
}