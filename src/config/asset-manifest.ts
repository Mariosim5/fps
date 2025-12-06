export interface AssetDefinition {
  id: string;
  url: string;
  types: ('organic' | 'mechanical' | 'hybrid' | 'magic' | 'custom')[];
  animations: {
    run: string;
  };
  scale: number;
}

export const ASSET_MANIFEST: AssetDefinition[] = [
  // Presets from "civilization simulation"
  {
    id: 'knight',
    url: 'https://raw.githubusercontent.com/quaternius/Animated-Fantasy-Characters/main/GLB/Knight.glb',
    types: ['organic', 'hybrid'],
    animations: {
      run: 'Run',
    },
    scale: 1.1,
  },
  {
    id: 'peasant',
    url: 'https://raw.githubusercontent.com/quaternius/Animated-Fantasy-Characters/main/GLB/Peasant.glb',
    types: ['organic'],
    animations: {
      run: 'Run',
    },
    scale: 1.0,
  },
  {
    id: 'stone_golem',
    url: 'https://raw.githubusercontent.com/quaternius/Animated-Monsters-Pack/main/GLB/StoneGolem.glb',
    types: ['magic', 'mechanical'],
    animations: {
      run: 'Run',
    },
    scale: 1.5,
  },
  // Fallback/Variety presets
  {
    id: 'dragon',
    url: 'https://raw.githubusercontent.com/quaternius/Animated-Monsters-Pack/main/GLB/Dragon.glb',
    types: ['organic', 'magic'],
    animations: {
      run: 'Run',
    },
    scale: 1.8,
  },
  {
    id: 'orc',
    url: 'https://raw.githubusercontent.com/quaternius/Animated-Fantasy-Characters/main/GLB/Orc.glb',
    types: ['organic', 'hybrid'],
    animations: {
      run: 'Run',
    },
    scale: 1.2,
  }
];
