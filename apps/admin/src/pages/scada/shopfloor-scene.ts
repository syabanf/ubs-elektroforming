import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { Palette } from '../../lib/palette'
import type { Point, Shopfloor } from './shopfloor'

// Object colours of the room (floor, steel, solutions), not UI colours.
const PHYSICAL = {
  floor: 0xc9ccc9,
  zone: 0xdfe2df,
  tub: 0xf1efe8,
  steel: 0xc9d0d7,
  dark: 0x2c343e,
  gold: 0xe2b53a,
  copper: 0x4fa3a5,
  cable: 0x3a3f45,
  desk: 0x8a6a4a,
}

const TANK_H = 1.1
const POLE_H = 1.9

/** Per-unit status the scene shows: whether it runs and whether its data is fresh. */
export type UnitLook = { running: boolean; fresh: boolean }

/**
 * The SCADA floor in 3D, built from the same plan as the 2D view. HTML labels hang over the tanks,
 * the modules and the mini PC; React renders into `labels`.
 */
export class ShopfloorScene {
  readonly labels = new Map<string, HTMLElement>()
  /** Data packets run along the network cables while true. */
  online = false
  motion = true

  private readonly renderer = new THREE.WebGLRenderer({ antialias: true })
  private readonly labelRenderer = new CSS2DRenderer()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
  private readonly controls: OrbitControls
  private readonly world = new THREE.Group()
  private readonly resizeObserver: ResizeObserver
  private readonly lamps = new Map<string, THREE.Mesh>()
  private readonly liquids = new Map<string, THREE.Mesh>()
  private packets: { curve: THREE.CurvePath<THREE.Vector3>; dots: THREE.Mesh[] }[] = []
  private readonly lampOn: THREE.MeshBasicMaterial
  private readonly lampStale: THREE.MeshBasicMaterial
  private readonly lampOff: THREE.MeshBasicMaterial
  private readonly packetMaterial: THREE.MeshBasicMaterial
  private frameId = 0
  private time = 0
  private last = performance.now()

  constructor(
    private readonly host: HTMLElement,
    palette: Palette,
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'
    host.appendChild(this.renderer.domElement)
    Object.assign(this.labelRenderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
    })
    host.appendChild(this.labelRenderer.domElement)

    const ink = new THREE.Color(palette.ink)
    this.scene.background = ink
    this.scene.fog = new THREE.Fog(ink, 30, 70)
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x2a3038, 2.4))
    const sun = new THREE.DirectionalLight(0xffffff, 3)
    sun.position.set(-8, 16, 12)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12 })
    this.scene.add(sun)
    this.scene.add(this.world)

    this.lampOn = new THREE.MeshBasicMaterial({ color: palette.success })
    this.lampStale = new THREE.MeshBasicMaterial({ color: palette.warning })
    this.lampOff = new THREE.MeshBasicMaterial({ color: palette.muted })
    this.packetMaterial = new THREE.MeshBasicMaterial({ color: palette.info })

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI * 0.47
    this.controls.minDistance = 5
    this.controls.maxDistance = 50

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(host)
    this.resize()
    this.frameId = requestAnimationFrame(this.frame)
  }

  /** Rebuilds the floor; labels are keyed by unit id, `module:<machine>` and `pc`. */
  setFloor(floor: Shopfloor) {
    this.clearWorld()
    const { w, d } = floor.room
    // The plan's origin is the back-left corner; the scene centres the room on the origin.
    const at = (x: number, z: number, y = 0) => new THREE.Vector3(x - w / 2, y, z - d / 2)
    const mat = (color: number, rest: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...rest })

    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(PHYSICAL.floor, { roughness: 0.9 }))
    floorMesh.rotation.x = -Math.PI / 2
    floorMesh.receiveShadow = true
    this.world.add(floorMesh)

    for (const z of floor.zones) {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d), mat(PHYSICAL.zone, { roughness: 0.9 }))
      patch.rotation.x = -Math.PI / 2
      patch.position.copy(at(z.x + z.w / 2, z.z + z.d / 2, 0.005))
      patch.receiveShadow = true
      this.world.add(patch)
    }

    for (const u of floor.units) {
      const centre = at(u.x + u.w / 2, u.z + u.d / 2)
      const tub = new THREE.Mesh(new THREE.BoxGeometry(u.w, TANK_H, u.d), mat(PHYSICAL.tub))
      tub.position.copy(centre).setY(TANK_H / 2)
      tub.castShadow = tub.receiveShadow = true
      const liquid = new THREE.Mesh(
        new THREE.PlaneGeometry(u.w - 0.2, u.d - 0.2),
        mat(u.unit.machine === 'ef' ? PHYSICAL.gold : PHYSICAL.copper, { roughness: 0.15, metalness: 0.3 }),
      )
      liquid.rotation.x = -Math.PI / 2
      liquid.position.copy(centre).setY(TANK_H + 0.002)
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), this.lampOff)
      lamp.position.copy(at(u.x + u.w - 0.2, u.z + 0.2, TANK_H + 0.12))
      this.world.add(tub, liquid, lamp)
      this.lamps.set(u.unit.id, lamp)
      this.liquids.set(u.unit.id, liquid)
      this.addLabel(u.unit.id, centre.clone().setY(TANK_H + 0.35))
    }

    for (const m of floor.modules) {
      const base = at(m.x + m.w / 2, m.z + m.d / 2)
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, POLE_H, 12),
        mat(PHYSICAL.steel, { metalness: 0.6 }),
      )
      pole.position.copy(base).setY(POLE_H / 2)
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.25), mat(PHYSICAL.dark))
      box.position.copy(base).setY(1.35)
      box.castShadow = true
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), this.lampOff)
      lamp.position.copy(base).add(new THREE.Vector3(0.15, 1.55, 0.14))
      this.world.add(pole, box, lamp)
      this.lamps.set(`module:${m.machine}`, lamp)
      this.addLabel(`module:${m.machine}`, base.clone().setY(POLE_H + 0.2))
    }

    const pcCentre = at(floor.pc.x + floor.pc.w / 2, floor.pc.z + floor.pc.d / 2)
    const desk = new THREE.Mesh(new THREE.BoxGeometry(floor.pc.w, 0.75, floor.pc.d), mat(PHYSICAL.desk))
    desk.position.copy(pcCentre).setY(0.375)
    desk.castShadow = desk.receiveShadow = true
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), mat(PHYSICAL.dark))
    screen.position.copy(pcCentre).add(new THREE.Vector3(0, 1.05, 0))
    const pc = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), mat(PHYSICAL.dark))
    pc.position.copy(pcCentre).add(new THREE.Vector3(0.6, 0.81, 0))
    this.world.add(desk, screen, pc)
    this.addLabel('pc', pcCentre.clone().setY(1.5))

    const curveOf = (path: Point[], y: number) => {
      const curve = new THREE.CurvePath<THREE.Vector3>()
      for (let i = 1; i < path.length; i++)
        curve.add(new THREE.LineCurve3(at(...path[i - 1]!, y), at(...path[i]!, y)))
      return curve
    }
    const cable = mat(PHYSICAL.cable)
    for (const c of floor.serial) {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curveOf(c.path, 0.02), 64, 0.02, 6), cable)
      this.world.add(tube)
    }
    for (const c of floor.network) {
      const curve = curveOf(c.path, 0.04)
      this.world.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.04, 8), cable))
      const dots = Array.from({ length: 5 }, () => {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), this.packetMaterial)
        this.world.add(dot)
        return dot
      })
      this.packets.push({ curve, dots })
    }

    // Look from the aisle side, far enough back that the row of tanks spans the view.
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect)
    const distance = (w / 2 / Math.tan(hfov / 2)) * 1.08
    const target = new THREE.Vector3(0, 0.8, -d / 2 + 2.5)
    this.controls.target.copy(target)
    this.camera.position.copy(target).add(new THREE.Vector3(0, 0.62, 0.78).setLength(distance))
    this.controls.update()
  }

  /** Lamp colours: green for fresh data, amber for old data, grey for none; liquid glows while running. */
  setUnits(units: Record<string, UnitLook | undefined>, modulesOnline: boolean) {
    for (const [id, lamp] of this.lamps) {
      if (id.startsWith('module:')) {
        lamp.material = modulesOnline ? this.lampOn : this.lampOff
        continue
      }
      const look = units[id]
      lamp.material = !look ? this.lampOff : look.fresh ? this.lampOn : this.lampStale
      const liquid = this.liquids.get(id)!
      ;(liquid.material as THREE.MeshStandardMaterial).emissiveIntensity = look?.running ? 0.25 : 0
      ;(liquid.material as THREE.MeshStandardMaterial).emissive.set(look?.running ? 0xffffff : 0x000000)
    }
  }

  dispose() {
    cancelAnimationFrame(this.frameId)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.clearWorld()
    for (const m of [this.lampOn, this.lampStale, this.lampOff, this.packetMaterial]) m.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labelRenderer.domElement.remove()
  }

  /** Frees the floor's geometry and per-mesh materials, and takes its labels out of the page. */
  private clearWorld() {
    const shared = new Set<THREE.Material>([this.lampOn, this.lampStale, this.lampOff, this.packetMaterial])
    this.world.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      o.geometry.dispose()
      if (!shared.has(o.material)) (o.material as THREE.Material).dispose()
    })
    for (const el of this.labels.values()) el.remove()
    this.world.clear()
    this.labels.clear()
    this.lamps.clear()
    this.liquids.clear()
    this.packets = []
  }

  private addLabel(key: string, position: THREE.Vector3) {
    const el = document.createElement('div')
    const label = new CSS2DObject(el)
    label.position.copy(position)
    label.center.set(0.5, 1)
    this.world.add(label)
    this.labels.set(key, el)
  }

  private resize() {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.labelRenderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    if (this.motion) this.time += dt
    for (const { curve, dots } of this.packets)
      dots.forEach((dot, i) => {
        // A path of straight segments: getPoint already spaces by length, and it returns null past the end.
        const point = this.online ? curve.getPoint((this.time * 0.18 + i / dots.length) % 1) : null
        dot.visible = point !== null
        if (point) dot.position.copy(point)
      })
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.labelRenderer.render(this.scene, this.camera)
    this.frameId = requestAnimationFrame(this.frame)
  }
}
