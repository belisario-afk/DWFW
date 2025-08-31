import * as THREE from 'three'
import type { BaseScene } from '@visuals/baseScene'
import { BaseScene as SceneBase } from '@visuals/baseScene'
import type { Palette } from '@visuals/engine'

export class AudioTerrainScene extends SceneBase implements BaseScene {
  private mesh!: THREE.Mesh
  private wire!: THREE.LineSegments
  private geom!: THREE.PlaneGeometry
  private resX = 128
  private resZ = 192
  private width = 24
  private depth = 48
  private heights!: Float32Array // length = (resX+1)*(resZ+1)
  private viewOffset = 0

  async init(scene: THREE.Scene): Promise<void> {
    this.geom = new THREE.PlaneGeometry(this.width, this.depth, this.resX, this.resZ)
    this.geom.rotateX(-Math.PI/2)
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.9,
      emissive: 0x000000
    })
    this.mesh = new THREE.Mesh(this.geom, mat)
    this.mesh.position.z = -10
    scene.add(this.mesh)

    // Wire overlay for definition
    const wireGeo = new THREE.WireframeGeometry(this.geom)
    const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 })
    this.wire = new THREE.LineSegments(wireGeo, wireMat)
    this.mesh.add(this.wire)

    const dir = new THREE.DirectionalLight(0xffffff, 0.7)
    dir.position.set(3, 4, -2)
    scene.add(dir)
    scene.add(new THREE.AmbientLight(0xffffff, 0.2))

    this.heights = new Float32Array((this.resX+1)*(this.resZ+1))
  }

  update(t: number, dt: number): void {
    const f = this.engine.analyzer.frame
    // Create new row from bands (lanes across X)
    const lanes = 5
    const laneVals = [
      f.bands.bass, f.bands.lowMid, f.bands.mid, f.bands.highMid, f.bands.highs
    ]
    const row: number[] = []
    for (let i=0;i<=this.resX;i++) {
      const u = i/this.resX
      const lane = Math.min(lanes-1, Math.floor(u * lanes))
      row.push(laneVals[lane])
    }
    // Normalize and shape
    const amp = 2.2
    for (let i=0;i<=this.resX;i++) row[i] = Math.pow(THREE.MathUtils.clamp(row[i]*2.2, 0, 1), 1.2) * amp

    // Shift existing heights towards +Z and insert at front
    const W = this.resX+1, H = this.resZ+1
    for (let z=H-1; z>0; z--) {
      const dst = z*W
      const src = (z-1)*W
      this.heights.copyWithin(dst, src, src+W)
    }
    for (let x=0;x<W;x++) this.heights[x] = row[x]

    // Apply to geometry positions
    const pos = this.geom.attributes.position as THREE.BufferAttribute
    let idx = 0
    for (let z=0; z<H; z++) {
      for (let x=0; x<W; x++) {
        const i = z*W + x
        pos.setY(idx, this.heights[i] - 1.2) // center around 0
        idx++
      }
    }
    pos.needsUpdate = true
    this.geom.computeVertexNormals()

    // Camera glide synced to beat if available
    if (f.beatConfidence > 0.4) {
      const ph = f.beatPhase
      const dz = (Math.sin(ph * Math.PI*2) * 0.4)
      this.engine.camera.position.set(0, 2.6, -8 + dz)
      this.engine.camera.lookAt(0, 0, -12)
    }

    // Emissive tint and subtle onsets
    const mat = this.mesh.material as THREE.MeshStandardMaterial
    const energy = THREE.MathUtils.clamp(f.rms*3.0, 0, 1)
    mat.emissiveIntensity = 0.2 + energy*0.6
  }

  setPalette(p: Palette): void {
    const mat = this.mesh.material as THREE.MeshStandardMaterial
    mat.color = new THREE.Color(p.bg).lerp(new THREE.Color(p.primary), 0.15)
    ;(this.wire.material as THREE.LineBasicMaterial).color = new THREE.Color(p.secondary)
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh)
    this.geom.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.wire.geometry.dispose()
    ;(this.wire.material as THREE.Material).dispose()
  }
}