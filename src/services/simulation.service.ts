import { Injectable, signal, inject, OnDestroy } from '@angular/core';
import { Enemy, StatusEffect } from '../models/simulation.model';
import { SIMULATION_WORKER_SCRIPT } from './simulation-worker.script';
import { ASSET_MANIFEST } from '../config/asset-manifest';
import { EnemyFactoryService, EnemyTemplate } from './enemy-factory.service';
import { ScenarioFactoryService } from './scenario-factory.service';
import { SceneCustomizationService } from './scene-customization.service';

@Injectable({
  providedIn: 'root',
})
export class SimulationService implements OnDestroy {
  private worker: Worker;
  private enemyFactory = inject(EnemyFactoryService);
  private scenarioFactory = inject(ScenarioFactoryService);
  private sceneCustomizationService = inject(SceneCustomizationService);

  private aiGeneratedQueue: EnemyTemplate[] = [];
  private isGeneratingInBackground = false;
  private isGeneratingScenario = false;

  // === Player State ===
  playerHealth = signal<number>(100);
  maxPlayerHealth = 100;

  // === Game State ===
  gameState = signal<'creation' | 'running' | 'lost'>('creation');
  
  // === Public State Signals ===
  enemies = signal<Map<string, Enemy>>(new Map());
  tickCounter = signal<number>(0);
  enemiesDefeated = signal<number>(0);
  
  // === Forge State Signals ===
  forgeStatusMessage = signal<string>('In attesa...');
  generatedEnemiesQueue = signal<Readonly<EnemyTemplate[]>>([]);
  scenarioStatus = signal<'idle' | 'generating' | 'done' | 'error'>('idle');

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
  
  prepareAndStartGame() {
    this.gameState.set('creation');
    this.worker.postMessage({ type: 'init', payload: { assetManifest: ASSET_MANIFEST }});
    this._startBackgroundGeneration();
  }

  startSimulation() {
    // When starting with randoms, use the pre-generated AI theme.
    this.sceneCustomizationService.usePreGeneratedAiTheme();
    
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
    this.stopBackgroundGeneration();
    this.aiGeneratedQueue = [];
    this.playerHealth.set(this.maxPlayerHealth);
    this.enemiesDefeated.set(0);
    this.tickCounter.set(0);
    this.sceneCustomizationService.resetToDefaultTheme();
    this.gameState.set('creation');
    // Reset forge signals
    this.forgeStatusMessage.set('In attesa...');
    this.generatedEnemiesQueue.set([]);
    this.scenarioStatus.set('idle');
    this._startBackgroundGeneration();
  }
  
  private _generateBackgroundScenario() {
    if (this.isGeneratingScenario || this.sceneCustomizationService.preGeneratedAiTheme()) {
      return;
    }
    this.isGeneratingScenario = true;
    this.scenarioStatus.set('generating');
    console.log("Fucina Perpetua: Inizio forgiatura di un nuovo scenario...");

    this.scenarioFactory.generateRandomScenario()
      .then(theme => {
        if (theme) {
          console.log(`Fucina Perpetua: Nuovo scenario forgiato: "${theme.name}"`);
          this.sceneCustomizationService.setPreGeneratedAiTheme(theme);
          this.scenarioStatus.set('done');
        } else {
            this.scenarioStatus.set('error');
        }
      })
      .catch(error => {
        console.error("Fucina Perpetua: Errore durante la forgiatura dello scenario.", error);
        this.scenarioStatus.set('error');
      })
      .finally(() => {
        this.isGeneratingScenario = false;
      });
  }

  private async _startBackgroundGeneration() {
    if (this.isGeneratingInBackground) return;
    this.isGeneratingInBackground = true;

    this._generateBackgroundScenario(); // Kick off scenario generation

    console.log("Fucina Perpetua: Inizio generazione Eidolon in background...");
    this.forgeStatusMessage.set('Avvio del processo di forgiatura...');

    (async () => {
      while (this.isGeneratingInBackground) {
        try {
          const newTemplates = await this.enemyFactory.generateEnemyTemplates(1, (message: string) => this.forgeStatusMessage.set(message));
          if (newTemplates.length > 0 && this.isGeneratingInBackground) {
            console.log(`Fucina Perpetua: Nuovo Eidolon "${newTemplates[0].name}" forgiato. In coda: ${this.aiGeneratedQueue.length + 1}`);
            this.aiGeneratedQueue.push(newTemplates[0]);
            this.generatedEnemiesQueue.set([...this.aiGeneratedQueue]);
          }
        } catch (error) {
          console.error("Fucina Perpetua: Errore durante la generazione in background. Riprovo tra 10 secondi.", error);
          this.forgeStatusMessage.set('Errore di forgiatura. Riprovo...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
      console.log("Fucina Perpetua: Generazione Eidolon in background interrotta.");
    })();
  }
  
  private stopBackgroundGeneration() {
      this.isGeneratingInBackground = false;
  }
  
  private requestReinforcement() {
    let template: EnemyTemplate;

    if (this.aiGeneratedQueue.length > 0) {
      template = this.aiGeneratedQueue.shift()!;
      this.generatedEnemiesQueue.set([...this.aiGeneratedQueue]);
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
    if (this.gameState() === 'running') {
      this.worker.postMessage({ type: 'tick', payload: playerPosition });
    }
  }

  ngOnDestroy() {
    this.worker.terminate();
    this.stopBackgroundGeneration();
  }
}