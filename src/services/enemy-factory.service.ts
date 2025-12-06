import { Injectable, inject } from '@angular/core';
import { GeminiService, GeminiEnemyResponse } from './gemini.service';
import { AssetManagerService } from './asset-manager.service';
import { Enemy } from '../models/simulation.model';

export type EnemyTemplate = Partial<Enemy>;

@Injectable({
  providedIn: 'root'
})
export class EnemyFactoryService {
  private geminiService = inject(GeminiService);
  private assetManagerService = inject(AssetManagerService);

  /**
   * Generates a list of unique, AI-powered enemy templates.
   * This process is resilient, retrying failures until the requested count is met.
   * @param count The number of unique enemy templates to create.
   * @param onProgress Callback to report real-time progress to the UI.
   * @returns A promise that resolves to an array of enemy templates.
   */
  async generateEnemyTemplates(
    count: number, 
    onProgress: (message: string) => void
  ): Promise<EnemyTemplate[]> {
    const templates: EnemyTemplate[] = [];
    let i = 0;
    while (i < count) {
      const progressPrefix = `[${i + 1}/${count}]`;

      try {
        // 1. Generate a unique concept for an enemy
        onProgress(`${progressPrefix} Generazione concetto...`);
        const concept = await this.geminiService.generateEnemyConcept();
        
        // 2. Design the enemy's stats and get a model suggestion based on the concept
        onProgress(`${progressPrefix} Progettazione Eidolon: "${concept}"...`);
        const enemyData = await this.geminiService.generateEnemy(concept);
        if (!enemyData || !enemyData.genome || !enemyData.name) {
          throw new Error(`L'IA non ha generato dati validi per il concetto: "${concept}"`);
        }

        // 3. Persistently find and validate a 3D model for the concept
        onProgress(`${progressPrefix} Ricerca e validazione del modello 3D...`);
        const modelUrl = await this.findAndValidateModel(concept, enemyData.modelUrl, progressPrefix, onProgress);

        if (modelUrl) {
          onProgress(`${progressPrefix} Eidolon "${enemyData.name}" materializzato con successo.`);
          templates.push({
            name: enemyData.name,
            genome: enemyData.genome,
            genomeType: enemyData.genomeType,
            modelUrl: modelUrl,
          });
          i++; // Success, move to the next template
        } else {
           throw new Error(`Impossibile materializzare un modello 3D per "${concept}" dopo molteplici tentativi.`);
        }

      } catch (error) {
        console.warn(`Generazione del template ${i + 1} fallita. Riprovo con un nuovo concetto.`, error);
        onProgress(`${progressPrefix} Errore, si riprova con un nuovo concetto...`);
        // The loop will automatically try again for the same 'i'
      }
    }
    return templates;
  }

  /**
   * Attempts to find a valid, loadable .glb model URL.
   * It first tries the suggested URL, then makes multiple attempts using Gemini for fallback searches.
   * @param concept The enemy concept for which to find a model.
   * @param initialUrl The first URL suggested by the AI.
   * @param onProgress Callback to report progress.
   * @returns A promise that resolves to a valid URL string or null if unsuccessful.
   */
  private async findAndValidateModel(
    concept: string, 
    initialUrl: string | undefined, 
    progressPrefix: string,
    onProgress: (message: string) => void,
    maxRetries: number = 4
  ): Promise<string | null> {
    
    // Attempt 1: Try the initial URL provided by the main generation call
    onProgress(`${progressPrefix} Validazione del modello primario...`);
    let validUrl = await this.assetManagerService.resolveModelUrl(initialUrl);
    if (validUrl) {
      return validUrl;
    }

    onProgress(`${progressPrefix} Modello primario invalido. Avvio ricerca fallback...`);

    // Attempts 2 to maxRetries+1: Use fallback search
    for (let i = 0; i < maxRetries; i++) {
        onProgress(`${progressPrefix} Tentativo di fallback (${i + 1}/${maxRetries})...`);
        const fallbackUrl = await this.geminiService.findFallbackModelUrl(concept);
        validUrl = await this.assetManagerService.resolveModelUrl(fallbackUrl);
        if (validUrl) {
          return validUrl;
        }
    }

    console.error(`Impossibile trovare un modello valido per il concetto "${concept}" dopo ${maxRetries + 1} tentativi totali.`);
    return null;
  }
}
