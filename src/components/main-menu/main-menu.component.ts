import { Component, ChangeDetectionStrategy, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EnemyTemplate } from '../../services/enemy-factory.service';

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './main-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainMenuComponent {
  simulationRequested = output();
  modelsLoaded = input.required<boolean>();
  forgeStatusMessage = input.required<string>();
  generatedEnemiesQueue = input.required<Readonly<EnemyTemplate[]>>();
  scenarioStatus = input.required<'idle' | 'generating' | 'done' | 'error'>();

  startSimulation() {
    this.simulationRequested.emit();
  }
}
