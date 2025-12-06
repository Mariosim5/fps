import { Injectable, signal, computed } from '@angular/core';
import * as THREE from 'three';

export type Theme = 'default' | 'magic' | 'horror' | 'egypt';

export interface DecorationDefinition {
  url: string;
  scale: number;
  positions: { pos: [number, number, number], rotY: number }[];
}

export interface ThemeDefinition {
  id: Theme | 'ai-generated';
  name: string;
  floor: string;
  wall: string;
  skyColor: THREE.Color;
  decorations: DecorationDefinition[];
}

const lampPositions = [];
const spacing = 8;
const worldHalfLength = 40;
for (let z = -worldHalfLength + spacing; z < worldHalfLength; z += spacing) {
    lampPositions.push({ pos: [-5.2, 2.5, z], rotY: 0 });
    lampPositions.push({ pos: [5.2, 2.5, z], rotY: Math.PI });
}

export const THEMES: Record<Theme, ThemeDefinition & { id: Theme }> = {
  default: {
    id: 'default',
    name: 'Cripta di Pietra',
    floor: 'https://raw.githubusercontent.com/pmndrs/drei-assets/main/prototype/textures/paving-stones-1k/paving-stones_diff_1k.jpg',
    wall: 'https://raw.githubusercontent.com/pmndrs/drei-assets/main/prototype/textures/rock-wall/rock-wall_diff_1k.jpg',
    skyColor: new THREE.Color(0x1a1a2a),
    decorations: [
       {
        url: 'https://raw.githubusercontent.com/quaternius/Ultimate-Props-Pack/main/GLB/WallLamp.glb',
        scale: 1.0,
        positions: lampPositions
      }
    ]
  },
  magic: {
    id: 'magic',
    name: 'Santuario Arcano',
    floor: 'https://raw.githubusercontent.com/pmndrs/drei-assets/main/prototype/textures/cosmic-stones/cosmic-stones_diff_1k.jpg',
    wall: 'https://raw.githubusercontent.com/pmndrs/drei-assets/main/prototype/textures/rock-wall/rock-wall_diff_1k.jpg',
    skyColor: new THREE.Color(0x3d1a5c),
    decorations: [
      {
        url: 'https://raw.githubusercontent.com/quaternius/Ultimate-Props-Pack/main/GLB/Crystal.glb',
        scale: 0.8,
        positions: [
          { pos: [-4.5, 0, -30], rotY: 0.5 },
          { pos: [4.5, 0, -20], rotY: -0.5 },
          { pos: [-4.5, 0, -10], rotY: 0.2 },
          { pos: [4.5, 0, 0], rotY: -0.2 },
          { pos: [-4.5, 0, 10], rotY: 0.7 },
          { pos: [4.5, 0, 20], rotY: -0.7 },
          { pos: [-4.5, 0, 30], rotY: 0.3 },
        ]
      }
    ]
  },
  horror: {
    id: 'horror',
    name: 'Abisso Inquietante',
    floor: 'https://raw.githubusercontent.com/pmndrs/drei-assets/main/prototype/textures/metal-plates/metal-plates_diff_1k.jpg',
    wall: 'https://raw.githubusercontent.com/pmndrs/drei-assets/main/prototype/textures/facade-5/facade-5_diff_1k.jpg',
    skyColor: new THREE.Color(0x3d0000),
     decorations: [
      {
        url: 'https://raw.githubusercontent.com/quaternius/Ultimate-Props-Pack/main/GLB/Skull.glb',
        scale: 0.5,
        positions: [
          { pos: [-4.8, 0, -35], rotY: 0.5 }, { pos: [-4.8, 0.5, -35], rotY: 0.2 }, { pos: [-4.8, 1.0, -35], rotY: -0.3 },
          { pos: [4.8, 0, -15], rotY: -0.5 }, { pos: [4.8, 0.5, -15], rotY: -0.2 },
          { pos: [-4.8, 0, 5], rotY: 0.5 },
          { pos: [4.8, 0, 25], rotY: -0.5 }, { pos: [4.8, 0.5, 25], rotY: -0.2 },{ pos: [4.8, 1.0, 25], rotY: 0.3 }, { pos: [4.8, 1.5, 25], rotY: 0.8 },
        ]
      }
    ]
  },
  egypt: {
    id: 'egypt',
    name: 'Tomba del Faraone',
    floor: 'https://raw.githubusercontent.com/pmndrs/drei-assets/main/prototype/textures/sand-dunes/sand-dunes_diff_1k.jpg',
    wall: 'https://raw.githubusercontent.com/pmndrs/drei-assets/main/prototype/textures/egyptian-wall/egyptian-wall_diff_1k.jpg',
    skyColor: new THREE.Color(0x693d21),
     decorations: [
      {
        url: 'https://raw.githubusercontent.com/quaternius/Ultimate-Dungeon-Pack/main/GLB/Pillar.glb',
        scale: 1,
        positions: [
           { pos: [-4.5, 0, -30], rotY: 0 },
           { pos: [4.5, 0, -30], rotY: 0 },
           { pos: [-4.5, 0, -15], rotY: 0 },
           { pos: [4.5, 0, -15], rotY: 0 },
           { pos: [-4.5, 0, 0], rotY: 0 },
           { pos: [4.5, 0, 0], rotY: 0 },
           { pos: [-4.5, 0, 15], rotY: 0 },
           { pos: [4.5, 0, 15], rotY: 0 },
           { pos: [-4.5, 0, 30], rotY: 0 },
           { pos: [4.5, 0, 30], rotY: 0 },
        ]
      }
    ]
  }
};


@Injectable({
  providedIn: 'root'
})
export class SceneCustomizationService {
  selectedThemeId = signal<Theme>('default');
  preGeneratedAiTheme = signal<ThemeDefinition | null>(null);
  private overrideTheme = signal<ThemeDefinition | null>(null);

  activeThemeDefinition = computed<ThemeDefinition>(() => {
    const override = this.overrideTheme();
    if (override) {
      return override;
    }
    return THEMES[this.selectedThemeId()];
  });

  getThemeDefinition(theme: Theme): ThemeDefinition {
    return THEMES[theme];
  }

  getThemeList(): (ThemeDefinition & {id: Theme})[] {
    return Object.values(THEMES);
  }

  selectTheme(themeId: Theme) {
    this.selectedThemeId.set(themeId);
    this.overrideTheme.set(null); // Clear any override when user makes a manual selection
  }
  
  setPreGeneratedAiTheme(theme: ThemeDefinition | null) {
    this.preGeneratedAiTheme.set(theme);
  }

  usePreGeneratedAiTheme() {
    const theme = this.preGeneratedAiTheme();
    if (theme) {
      this.overrideTheme.set(theme);
    } else {
        // Fallback: pick a random theme from the presets if AI theme isn't ready
        const themeIds = Object.keys(THEMES) as Theme[];
        const randomThemeId = themeIds[Math.floor(Math.random() * themeIds.length)];
        this.selectTheme(randomThemeId);
    }
  }
  
  resetToDefaultTheme() {
    this.selectTheme('default');
    this.setPreGeneratedAiTheme(null);
  }
}
