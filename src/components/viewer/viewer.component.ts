import { Component, ChangeDetectionStrategy, viewChild, ElementRef, AfterViewInit, OnDestroy, effect, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Enemy } from '../../models/simulation.model';
import { ThreeService } from '../../services/three.service';

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './viewer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // A block-level element that fills its container is required for child
    // elements with percentage-based height (like the canvas) to render correctly.
    'class': 'block w-full h-full'
  }
})
export class ViewerComponent implements AfterViewInit, OnDestroy {
  enemies = input.required<Enemy[]>();

  canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private threeService = inject(ThreeService);
  controlsLocked = this.threeService.controlsLocked;

  constructor() {
    // This effect synchronizes all simulation data with the 3D scene.
    effect(() => {
      this.threeService.updateEnemies(this.enemies());
    });
  }

  async ngAfterViewInit(): Promise<void> {
    await this.threeService.initialize(this.canvas().nativeElement);
    this.threeService.animate();
  }

  ngOnDestroy(): void {
    this.threeService.cleanup();
  }
}