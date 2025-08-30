import type { VisualEngine } from './engine'

export abstract class BaseScene {
  engine: VisualEngine
  constructor(engine: VisualEngine) { this.engine = engine }
  abstract init(scene: THREE.Scene): Promise<void>
  abstract update(t: number, dt: number): void
  abstract setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void
  abstract dispose(scene: THREE.Scene): void
}