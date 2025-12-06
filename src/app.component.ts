import { Component, ChangeDetectionStrategy, signal, computed, inject, effect, OnDestroy, OnInit } from '@angular/core';
import { DOCUMENT, CommonModule, DecimalPipe } from '@angular/common';
import { ViewerComponent } from './components/viewer/viewer.component';
import { InspectorComponent } from './components/inspector/inspector.component';
import { SimulationService } from './services/simulation.service';
import { ThreeService } from './services/three.service';
import { Enemy } from './models/simulation.model';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ViewerComponent, InspectorComponent],
  providers: [ThreeService, DecimalPipe],
  host: {
    'class': 'relative block w-full h-full',
    '(document:mousemove)': 'onUserActivity()',
    '(document:keydown)': 'onUserActivity()',
  }
})
export class AppComponent implements OnDestroy, OnInit {
  private simulationService = inject(SimulationService);
  private threeService = inject(ThreeService);
  private document = inject(DOCUMENT);

  // === UI State Signals ===
  isFullscreen = signal<boolean>(!!this.document.fullscreenElement);
  isHudVisible = signal(true);
  private hudVisibilityTimeout: any;

  // Expose signal for the template
  controlsLocked = this.threeService.controlsLocked;
  currentSpell = this.threeService.currentSpell;
  modelsLoaded = this.threeService.modelsLoaded;
  targetedEnemy = this.threeService.targetedEnemy;

  // === Game State & Data Signals from Service ===
  gameState = this.simulationService.gameState;
  enemiesDefeated = this.simulationService.enemiesDefeated;
  playerHealth = this.simulationService.playerHealth;
  maxPlayerHealth = this.simulationService.maxPlayerHealth;
  private enemiesMap = this.simulationService.enemies;
  enemies = computed(() => Array.from(this.enemiesMap().values()));
  enemiesRemaining = computed(() => this.enemiesMap().size);

  isAutoHideMode = computed(() => this.threeService.controlsLocked());

  // For damage flash effect
  damageTaken = signal(false);
  private previousPlayerHealth = this.simulationService.maxPlayerHealth;


  constructor() {
    this.document.addEventListener('fullscreenchange', this.onFullscreenChange);

    // Effect for HUD visibility
    effect(() => {
      const state = this.gameState();
      const controlsAreLocked = this.isAutoHideMode();
      
      if (controlsAreLocked && state === 'running') {
        this.resetHudVisibilityTimer();
      } else {
        this.isHudVisible.set(true);
        clearTimeout(this.hudVisibilityTimeout);
      }
    }, { allowSignalWrites: true });

    // Effect for damage flash
    effect(() => {
        const currentHealth = this.playerHealth();
        if (currentHealth < this.previousPlayerHealth) {
            this.damageTaken.set(true);
            setTimeout(() => this.damageTaken.set(false), 200);
        }
        this.previousPlayerHealth = currentHealth;
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.simulationService.prepareAndStartGame();
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    clearTimeout(this.hudVisibilityTimeout);
  }

  startGame(): void {
    this.simulationService.startGame();
  }

  restartGame(): void {
    this.simulationService.restart();
  }
  
  private onFullscreenChange = (): void => {
    this.isFullscreen.set(!!this.document.fullscreenElement);
  }
  
  toggleFullscreen(): void {
    if (!this.document.fullscreenElement) {
      this.document.documentElement.requestFullscreen();
    } else if (this.document.exitFullscreen) {
      this.document.exitFullscreen();
    }
  }

  private onUserActivity(): void {
    if (this.isAutoHideMode() && this.gameState() === 'running') {
      this.resetHudVisibilityTimer();
    }
  }

  private resetHudVisibilityTimer(): void {
    this.isHudVisible.set(true);
    clearTimeout(this.hudVisibilityTimeout);
    this.hudVisibilityTimeout = setTimeout(() => {
      if(this.controlsLocked()){
        this.isHudVisible.set(false);
      }
    }, 3000); // Hide after 3 seconds of inactivity
  }
}