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
  // Creatures
  {
    id: 'demon',
    url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Demon.glb',
    types: ['magic', 'organic'],
    animations: { run: 'Run' },
    scale: 1.3,
  },
  {
    id: 'dragon',
    url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Dragon.glb',
    types: ['organic', 'magic'],
    animations: { run: 'Run' },
    scale: 1.8,
  },
  {
    id: 'elemental',
    url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Elemental.glb',
    types: ['magic'],
    animations: { run: 'Run' },
    scale: 1.2,
  },
  {
    id: 'golem',
    url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Golem.glb',
    types: ['mechanical', 'magic'],
    animations: { run: 'Run' },
    scale: 1.5,
  },
  {
    id: 'minotaur',
    url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Minotaur.glb',
    types: ['organic', 'hybrid'],
    animations: { run: 'Run' },
    scale: 1.4,
  },
  {
    id: 'orc',
    url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Orc.glb',
    types: ['organic'],
    animations: { run: 'Run' },
    scale: 1.1,
  },
  {
    id: 'skeleton',
    url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Skeleton.glb',
    types: ['organic', 'magic'],
    animations: { run: 'Run' },
    scale: 1.0,
  },
  {
    id: 'slime',
    url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Slime.glb',
    types: ['organic', 'custom'],
    animations: { run: 'Run' },
    scale: 0.8,
  },
  {
    id: 'witch',
    url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Witch.glb',
    types: ['organic', 'magic'],
    animations: { run: 'Run' },
    scale: 1.0,
  },
  // Fantasy Weapons (Treated as magical/animated enemies)
  { id: 'battle_axe', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_BattleAxe.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.8 },
  { id: 'club', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Club.glb', types: ['magic', 'organic'], animations: { run: 'none' }, scale: 0.8 },
  { id: 'dagger', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Dagger.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.6 },
  { id: 'flanged_mace', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Flanged_Mace.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.8 },
  { id: 'hammer', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Hammer.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.8 },
  { id: 'hatchet', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Hatchet.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.7 },
  { id: 'iron_mace', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Iron_Mace.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.8 },
  { id: 'katana', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Katana.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.9 },
  { id: 'longsword', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Longsword.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.9 },
  { id: 'rapier', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Rapier.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.9 },
  { id: 'scimitar', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Scimitar.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.9 },
  { id: 'shortsword', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Shortsword.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.8 },
  { id: 'sickle', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Sickle.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.7 },
  { id: 'viking_axe', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/1H_Viking_Axe.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.8 },
  { id: 'claymore', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/2H_Claymore.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 1.2 },
  { id: 'greatsword', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/2H_Greatsword.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 1.2 },
  { id: 'halberd', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/2H_Halberd.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 1.3 },
  { id: 'scythe', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/2H_Scythe.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 1.1 },
  { id: 'spear', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/2H_Spear.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 1.2 },
  { id: 'trident', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/2H_Trident.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 1.2 },
  { id: 'warhammer', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/2H_Warhammer.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 1.2 },
  { id: 'crossbow', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/Crossbow.glb', types: ['magic', 'mechanical'], animations: { run: 'none' }, scale: 0.8 },
  { id: 'longbow', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Fantasy_Weapons/Longbow.glb', types: ['magic', 'organic'], animations: { run: 'none' }, scale: 1.0 },
  // Nature (Treated as corrupted/animated enemies)
  { id: 'corrupted_tree', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Nature/Tree.glb', types: ['magic', 'organic'], animations: { run: 'none' }, scale: 2.0 },
  { id: 'corrupted_pine_tree', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Nature/Tree_Pine.glb', types: ['magic', 'organic'], animations: { run: 'none' }, scale: 2.2 },
  { id: 'corrupted_spruce_tree', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Nature/Tree_Spruce.glb', types: ['magic', 'organic'], animations: { run: 'none' }, scale: 2.1 },
  { id: 'corrupted_willow_tree', url: 'https://raw.githubusercontent.com/Mariosim5/fps/main/assets/Nature/Tree_Willow.glb', types: ['magic', 'organic'], animations: { run: 'none' }, scale: 1.9 },
];
