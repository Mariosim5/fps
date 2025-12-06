import { Component, ChangeDetectionStrategy, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { GeminiService, GeminiEnemyResponse } from '../../services/gemini.service';
import { CreationService } from '../../services/creation.service';
import { Enemy } from '../../models/simulation.model';
import { AssetManagerService } from '../../services/asset-manager.service';

@Component({
  selector: 'app-creation-hub',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './creation-hub.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreationHubComponent {
  private geminiService = inject(GeminiService);
  private creationService = inject(CreationService);
  private assetManagerService = inject(AssetManagerService);

  simulationRequested = output();

  promptControl = new FormControl('a rock golem with glowing moss', [Validators.required, Validators.minLength(5)]);
  isLoading = signal(false);
  loadingMessage = signal('Genera Eidolon');
  error = signal<string | null>(null);

  customEnemies = this.creationService.customEnemies;
  
  async generateEnemy() {
    if (this.promptControl.invalid) {
      return;
    }
    this.isLoading.set(true);
    this.error.set(null);
    this.loadingMessage.set('Generazione statistiche...');

    try {
      const result = await this.geminiService.generateEnemy(this.promptControl.value!);
      
      if (!result) {
        throw new Error('L\'IA non ha restituito una risposta valida.');
      }

      let finalModelUrl: string | null = null;

      // 1. Validate the initial URL from Gemini
      if (result.modelUrl) {
        this.loadingMessage.set('Validazione URL modello...');
        finalModelUrl = await this.assetManagerService.resolveModelUrl(result.modelUrl);
      }
      
      // 2. If initial URL is invalid, try the fallback
      if (!finalModelUrl) {
        this.loadingMessage.set('URL invalido, avvio ricerca fallback...');
        const fallbackUrl = await this.geminiService.findFallbackModelUrl(this.promptControl.value!);
        
        if (fallbackUrl) {
          this.loadingMessage.set('Validazione modello di fallback...');
          finalModelUrl = await this.assetManagerService.resolveModelUrl(fallbackUrl);
        }
      }

      // 3. If we have a validated URL, create the enemy
      if (finalModelUrl) {
        result.modelUrl = finalModelUrl;
        this.creationService.addCustomEnemy(result as GeminiEnemyResponse);
        this.loadingMessage.set('Eidolon creato!');
      } else {
        throw new Error('Ricerca fallita. Impossibile trovare un modello 3D valido e accessibile.');
      }

    } catch (e: any) {
      this.error.set(e.message || 'An unknown error occurred.');
    } finally {
      this.isLoading.set(false);
      // Let the success/error message linger a bit before resetting button text
      setTimeout(() => {
        if (!this.isLoading()) {
          this.loadingMessage.set('Genera Eidolon');
        }
      }, 2000);
    }
  }

  removeEnemy(enemyId: string) {
    this.creationService.removeCustomEnemy(enemyId);
  }

  startSimulation() {
    this.simulationRequested.emit();
  }

  startWithRandom() {
    this.creationService.clearEnemies();
    this.simulationRequested.emit();
  }
}