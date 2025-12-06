export interface Genome {
  bodySize: number;
  numBuds: number;
  budSizeVariation: number;
  color: string;
  speed: number;
  armor: number;
}

export type GenomeType = 'organic' | 'mechanical' | 'hybrid' | 'custom' | 'magic';

export interface StatusEffect {
  type: 'burning' | 'gravity';
  duration: number; // in ticks
  startTime: number; // tickCounter value at start
  damagePerTick?: number; // For burning
  center?: { x: number; y: number; z: number }; // For gravity
  force?: number; // For gravity
}

export type EnemyBehavior = 'advancing' | 'strafing' | 'idle';

export interface Enemy {
  id: string;
  name: string; // Added for UI display
  genome: Genome;
  genomeType: GenomeType;
  modelUrl?: string;
  position: { x: number; y: number; z: number };
  age: number;
  velocity?: { x: number; y: number };
  zVelocity: number;
  health: number;
  maxHealth: number;
  statusEffects: StatusEffect[];
  // AI Fields
  behavior: EnemyBehavior;
  behaviorTimeout: number; // Ticks until next decision
  strafeDirection: -1 | 1;
}

export type EnemyTemplate = Partial<Enemy>;
