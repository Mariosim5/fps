import { Injectable, inject } from '@angular/core';
import { GeminiService } from './gemini.service';
import { THEMES, ThemeDefinition, DecorationDefinition } from './scene-customization.service';
import * as THREE from 'three';

// A version of ThemeDefinition that is serializable for Gemini
export interface GeminiThemeDefinition {
  id: 'ai-generated';
  name: string;
  description: string;
  floor: string; // URL
  wall: string; // URL
  skyColor: string; // Hex string #RRGGBB
  decorations: DecorationDefinition[];
}

@Injectable({
  providedIn: 'root'
})
export class ScenarioFactoryService {
  private geminiService = inject(GeminiService);

  private getAvailableAssets() {
    const allThemes = Object.values(THEMES);
    const uniqueFloors = [...new Set(allThemes.map(t => t.floor))].map(url => ({ name: url.split('/').pop()?.split('_diff_1k.jpg')[0].replace(/-/g, ' '), url }));
    const uniqueWalls = [...new Set(allThemes.map(t => t.wall))].map(url => ({ name: url.split('/').pop()?.split('_diff_1k.jpg')[0].replace(/-/g, ' '), url }));
    const uniqueDecorations = [...new Set(allThemes.flatMap(t => t.decorations.map(d => d.url)))].map(url => ({ name: url.split('/').pop()?.split('.glb')[0], url }));
    
    return { floors: uniqueFloors, walls: uniqueWalls, decorations: uniqueDecorations };
  }

  async generateRandomScenario(): Promise<ThemeDefinition | null> {
    const assets = this.getAvailableAssets();
    try {
      const geminiTheme = await this.geminiService.generateScenario(assets);
      if (!geminiTheme) return null;

      // Convert Gemini response to the application's ThemeDefinition
      return {
        ...geminiTheme,
        skyColor: new THREE.Color(geminiTheme.skyColor),
      };
    } catch (error) {
      console.error("Failed to generate scenario:", error);
      return null;
    }
  }
}
