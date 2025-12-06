import { Injectable } from '@angular/core';
import { Enemy } from '../models/simulation.model';

@Injectable({
  providedIn: 'root'
})
export class AgentDecisionService {

  constructor() { }

  decideBehavior(
    enemy: Enemy,
    playerPosition: { x: number; y: number; z: number; },
    enemiesNearby: Enemy[]
  ): Enemy {
    const updatedEnemy = { ...enemy };
    updatedEnemy.behaviorTimeout--;

    if (updatedEnemy.behaviorTimeout <= 0) {
      const dx = playerPosition.x - enemy.position.x;
      const dz = playerPosition.z - enemy.position.y;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      const rand = Math.random();

      if (distance > 8 && rand < 0.9) { // High chance to advance if far away
        updatedEnemy.behavior = 'advancing';
        updatedEnemy.behaviorTimeout = 180 + Math.floor(Math.random() * 120); // 3-5 seconds
      } else if (rand < 0.6) { // 60% chance to advance
        updatedEnemy.behavior = 'advancing';
        updatedEnemy.behaviorTimeout = 120 + Math.floor(Math.random() * 120); // 2-4 seconds
      } else { // 40% chance to strafe
        updatedEnemy.behavior = 'strafing';
        updatedEnemy.strafeDirection = Math.random() < 0.5 ? -1 : 1;
        updatedEnemy.behaviorTimeout = 60 + Math.floor(Math.random() * 60); // 1-2 seconds
      }
    }
    
    return updatedEnemy;
  }
}
