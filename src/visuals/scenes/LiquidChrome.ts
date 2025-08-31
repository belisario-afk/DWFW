import * as THREE from 'three'
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js'
import type { BaseScene } from '@visuals/baseScene'
import { BaseScene as SceneBase } from '@visuals/baseScene'
import type { Palette } from '@visuals/engine'

export class LiquidChromeScene extends SceneBase implements BaseScene {
  private mc!: MarchingCubes
  private group!: THREE.Group
  private material!: THREE.MeshStandardMaterial
  private light1!: THREE.PointLight
  private light2!: THREE.PointLight
  private env!: THREE.CubeTexture
  private t = 0

  async init(scene: THREE.Scene): Promise<void> {
    this.group = new THREE.Group()
    scene.add(this.group)

    // Environment cube from palette (simple gradient faces)
    this.env = this.makeEnvCube(this.engine.palette)

    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 1.0,
      roughness: 0.15,
      envMap: this.env,
      envMapIntensity: 1.0
    })

    const resolution = 48 // iGPU-friendly
    this.mc = new MarchingCubes(resolution, this.material, true, true)
    this.mc.isolation = 80
    this.mc.position.set(0, 0, -6)
    this.mc.scale.set(6, 6, 6)
    this.group.add(this.mc)

    const amb = new THREE.AmbientLight(0xffffff, 0.2)
    this.group.add(amb)
    this.light1 = new THREE.PointLight(0xffffff, 1.2, 40, 2)
    this.light2 = new THREE.PointLight(0xffffff, 1.0, 40, 2)
    this.light1.position.set(3, 3, -3)
    this.light2.position.set(-3, -2, -9)
    this.group.add(this.light1, this.light2)
  }

  update(t: number, dt: number): void {
    this.t += dt
    const f = this.engine.analyzer.frame
    const bass = THREE.MathUtils.clamp(f.bands.bass*2.2, 0, 1)
    const energy = THREE.MathUtils.clamp(f.rms*2.5, 0, 1)

    // Update marching cubes field
    this.mc.reset()
    const blobCount = Math.floor(8 + energy * 8) // 8..16
    const spread = 0.6
    const wobble = 0.15 + 0.1*bass
    for (let i=0;i<blobCount;i++) {
      const a = i / blobCount
      const x = 0.5 + Math.sin(this.t*0.6 + a*6.2831) * spread
      const y = 0.5 + Math.cos(this.t*0.8 + a*6.2831) * spread
      const z = 0.5 + Math.sin(this.t*0.7 + a*12.566 + energy) * spread
      const s = 0.5/blobCount + 0.02 + wobble*0.02
      this.mc.addBall(x, y, z, s, 12)
    }
    this.mc.isolation = 70 + Math.floor(10*bass)

    // Lights and material reactivity
    const centroid = THREE.MathUtils.clamp(f.spectralCentroid/8000, 0, 1)
    const warm = 0.5 + 0.5*Math.tanh((centroid - 0.5)*2.0)
    const p = this.engine.palette
    const col1 = new THREE.Color(p.primary).lerp(new THREE.Color(p.secondary), warm)
    const col2 = new THREE.Color(p.secondary).lerp(new THREE.Color(p.tert), 1.0-warm)
    this.light1.color = col1
    this.light2.color = col2
    this.material.roughness = 0.12 + (1.0 - energy)*0.1
    this.material.envMapIntensity = 1.0 + energy*0.4

    // Onset = quick scale pulse (strobe-safe)
    if (f.onset) {
      const s = 6.0 * (1.0 + Math.min(0.15, f.rms*0.6))
      this.mc.scale.setScalar(s)
    } else {
      // ease back to baseline
      const s = this.mc.scale.x + (6.0 - this.mc.scale.x) * (1 - Math.exp(-6*dt))
      this.mc.scale.setScalar(s)
    }
  }

  setPalette(pal: Palette): void {
    // Update env cube and lights
    this.env.dispose()
    this.env = this.makeEnvCube(pal)
    this.material.envMap = this.env
    this.material.needsUpdate = true
    this.light1.color = new THREE.Color(pal.primary)
    this.light2.color = new THREE.Color(pal.secondary)
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group)
    this.mc.dispose()
    this.material.dispose()
    this.env.dispose()
  }

  private makeEnvCube(p: Palette): THREE.CubeTexture {
    const mkFace = (c: string) => {
      const cnv = document.createElement('canvas')
      cnv.width = cnv.height = 64
      const ctx = cnv.getContext('2d')!
      const g = ctx.createLinearGradient(0,0,64,64)
      g.addColorStop(0, c)
      g.addColorStop(1, '#111111')
      ctx.fillStyle = g
      ctx.fillRect(0,0,64,64)
      return new THREE.CanvasTexture(cnv)
    }
    const faces = [
      mkFace(p.primary), mkFace(p.secondary),
      mkFace(p.tert), mkFace(p.bg),
      mkFace(p.primary), mkFace(p.secondary)
    ]
    const cube = new THREE.CubeTexture(faces.map(tex => tex.image as any))
    ;(cube as any).images = faces.map(f => f.image)
    cube.needsUpdate = true
    faces.forEach(f => f.dispose())
    return cube
  }
}