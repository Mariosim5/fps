import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule, KeyValuePipe, DecimalPipe } from '@angular/common';
import { Enemy } from '../../models/simulation.model';

@Component({
  selector: 'app-inspector',
  standalone: true,
  imports: [CommonModule, KeyValuePipe, DecimalPipe],
  templateUrl: './inspector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectorComponent {
  selectedEnemy = input<Enemy | null>(null);
}