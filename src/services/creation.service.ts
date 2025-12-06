import { Injectable, signal } from '@angular/core';
import { Enemy } from '../models/simulation.model';
import { GeminiEnemyResponse } from './gemini.service';

@Injectable({
  providedIn: 'root'
})
export class CreationService {
  private nextId = 0;
  customEnemies = signal<Partial<Enemy>[]>([]);

  addCustomEnemy(enemyData: GeminiEnemyResponse) {
    const newEnemy: Partial<Enemy> = {
      id: `custom_${this.nextId++}`,
      name: enemyData.name,
      genome: enemyData.genome,
      genomeType: enemyData.genomeType,
      modelUrl: enemyData.modelUrl,
    };
    this.customEnemies.update(enemies => [...enemies, newEnemy]);
  }

  removeCustomEnemy(enemyId: string) {
    this.customEnemies.update(enemies => enemies.filter(e => e.id !== enemyId));
  }

  clearEnemies() {
    this.customEnemies.set([]);
  }
}
