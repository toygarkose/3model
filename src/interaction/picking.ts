import * as THREE from 'three';
import type { SeatField } from '../scene/seatField';

/** Ekran noktasından koltuk seçimi (raycaster → instanceId → koltuk kaydı). */
export class Picker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly field: SeatField,
    private readonly occluders: THREE.Object3D[],
  ) {}

  at(clientX: number, clientY: number, loose: boolean): number {
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.field.pick(this.raycaster, this.occluders, loose);
  }
}
