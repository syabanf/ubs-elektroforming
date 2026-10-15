import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/** What the scene shows for one bath, already derived from the batch log. */
export type BathVisual = {
  id: string
  no: number
  name: string
  running: boolean
  /** Lamp colour: fine, needs a look, or not running. */
  tone: 'ok' | 'warn' | 'idle'
  volt: number | null
  tempC: number | null
  heating: boolean
  /** Deposit towards target, 0 to 1; the gold pieces on the rack grow with it. */
  progress: number
}

export type PickKey = `bath:${string}` | 'pc' | 'xray'

/** Theme colours read from the CSS tokens, so the room follows the app palette. */
export type Palette = {
  ink: string
  accent: string
  info: string
  success: string
  warning: string
  muted: string
}

export type Anchor = { key: PickKey; x: number; y: number; visible: boolean; scale: number; depth: number }

// Physical materials of the room. These are object colours (steel, glass, gold, skin), not UI colours.
const PHYSICAL = {
  floor: '#c9ccc9',
  wall: 0xe9ebee,
  steel: 0xc9d0d7,
  alu: 0xb9c1c9,
  white: 0xeef1f3,
  grey: 0x8d98a3,
  dark: 0x2c343e,
  navy: 0x1d2633,
  gold: 0xffcf5a,
  anode: 0x3a3f45,
  liquid: 0xe2b53a,
  glass: 0xcfe6f5,
  tub: 0xf1efe8,
  panel: 0x22449e,
  wood: 0x8a6a4a,
  heat: 0xff7a2a,
  heatGlow: 0xff5a00,
  heatOff: 0x6b4a3a,
  skin: 0xc58c66,
  coat: 0xf2f4f6,
  glove: 0x2f6fb0,
  beam: 0x8fd3ff,
  led: '#ff2a2a',
  ledBg: '#120606',
}

/** Tanks stand closer together once the line has more than four. */
const spacingFor = (n: number) => (n <= 4 ? 3.4 : 2.6)
const ROOM = { w: 18, d: 13 }
const AISLE_Z = 1.9
const PC_AT = new THREE.Vector3(-2.8, 0, 4.4)
const XRAY_AT = new THREE.Vector3(2.8, 0, 4.4)
/** Where the operator stands at the PC and at the X-ray, and which way they face there. */
const PC_SPOT = { x: PC_AT.x + 0.2, z: PC_AT.z + 1.45, face: Math.PI }
const XRAY_SPOT = { x: XRAY_AT.x - 1.15, z: XRAY_AT.z + 0.1, face: Math.PI / 2 }
const WALK_SPEED = 1.9

type Tank = {
  visual: BathVisual
  group: THREE.Group
  rack: THREE.Group
  door: THREE.Group
  gold: THREE.Mesh[]
  goldSize: number
  heaters: THREE.Mesh[]
  lamp: THREE.Mesh
  liquid: THREE.Mesh
  bubbles: THREE.Points
  steam: THREE.Points
  ledVolt: Led
  ledTemp: Led
  plate: Led
  y0: number
  /** Slot in the row; the tank slides there when baths are added or removed. */
  targetX: number
  /** 0 while a new tank rises out of the floor, 1 once it stands. */
  spawn: number
}

type Led = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture }

type Link = {
  curve: THREE.CatmullRomCurve3
  dots: THREE.Mesh[]
  offset: number
  tank: Tank | null
  burst: number
}

/** One step of the operator: walk somewhere, then hold a pose for a while. */
type Step = {
  status: string
  to?: { x: number; z: number; face: number }
  hold?: number
  pose?: 'check' | 'dip' | 'load' | 'type'
  onArrive?: () => void
  onDone?: () => void
}

type Operator = {
  root: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  sample: THREE.Mesh
  path: THREE.Vector3[]
  face: number
  phase: number
  steps: Step[]
  step: Step | null
  timer: number
  patrol: number
}

export class MonitorScene {
  onFrame: ((anchors: Anchor[]) => void) | null = null
  /** Called with a short sentence whenever the operator starts a new step. */
  onOperator: ((status: string) => void) | null = null
  /** Moving parts (operator, rack, bubbles, packets, camera flights). The page sets it from its Animasi switch. */
  motion = true
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(38, 1, 0.3, 200)
  private controls: OrbitControls
  private tanks: Tank[] = []
  private pickables: THREE.Object3D[] = []
  private links: Link[] = []
  private linkGroup = new THREE.Group()
  private pc: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture }
  private xray: { lid: THREE.Group; beam: THREE.Mesh; sample: THREE.Mesh; open: boolean; scanning: number }
  private operator: Operator
  private tween: {
    p0: THREE.Vector3
    t0: THREE.Vector3
    p1: THREE.Vector3
    t1: THREE.Vector3
    s: number
  } | null = null
  private openDoor: string | null = null
  private room = new THREE.Group()
  private roomWidth = 0
  private rowWidth = 0
  private sun!: THREE.DirectionalLight
  private currentView: 'all' | PickKey = 'all'
  private frameId = 0
  private last = performance.now()
  private time = 0
  private resizeObserver: ResizeObserver
  private materials: Record<string, THREE.Material>
  private dotMaterials: { ok: THREE.MeshBasicMaterial; warn: THREE.MeshBasicMaterial }
  private lampMaterials: Record<BathVisual['tone'], THREE.MeshBasicMaterial>
  private down: { x: number; y: number } | null = null
  private raycaster = new THREE.Raycaster()
  private readonly host: HTMLElement
  private readonly palette: Palette
  private readonly onPick: (key: PickKey | null) => void

  constructor(host: HTMLElement, palette: Palette, onPick: (key: PickKey | null) => void) {
    this.host = host
    this.palette = palette
    this.onPick = onPick
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'
    host.appendChild(this.renderer.domElement)

    const ink = new THREE.Color(palette.ink)
    this.scene.background = ink
    this.scene.fog = new THREE.Fog(ink, 28, 60)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.47
    this.controls.minDistance = 4
    this.controls.maxDistance = 60
    this.controls.screenSpacePanning = false

    this.materials = {
      steel: new THREE.MeshStandardMaterial({ color: PHYSICAL.steel, metalness: 0.55, roughness: 0.32 }),
      alu: new THREE.MeshStandardMaterial({ color: PHYSICAL.alu, metalness: 0.7, roughness: 0.3 }),
      white: new THREE.MeshStandardMaterial({ color: PHYSICAL.white, roughness: 0.55 }),
      grey: new THREE.MeshStandardMaterial({ color: PHYSICAL.grey, metalness: 0.3, roughness: 0.5 }),
      dark: new THREE.MeshStandardMaterial({ color: PHYSICAL.dark, metalness: 0.3, roughness: 0.6 }),
      navy: new THREE.MeshStandardMaterial({ color: PHYSICAL.navy, roughness: 0.8 }),
      gold: new THREE.MeshStandardMaterial({ color: PHYSICAL.gold, metalness: 1, roughness: 0.22 }),
      anode: new THREE.MeshStandardMaterial({ color: PHYSICAL.anode, metalness: 0.7, roughness: 0.4 }),
      liquid: new THREE.MeshStandardMaterial({
        color: PHYSICAL.liquid,
        transparent: true,
        opacity: 0.72,
        roughness: 0.1,
        depthWrite: false,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: PHYSICAL.glass,
        transparent: true,
        opacity: 0.16,
        roughness: 0.05,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      tub: new THREE.MeshStandardMaterial({ color: PHYSICAL.tub, roughness: 0.6, side: THREE.DoubleSide }),
      panel: new THREE.MeshStandardMaterial({ color: PHYSICAL.panel, roughness: 0.45, metalness: 0.2 }),
      wood: new THREE.MeshStandardMaterial({ color: PHYSICAL.wood, roughness: 0.8 }),
      heatOn: new THREE.MeshStandardMaterial({
        color: PHYSICAL.heat,
        emissive: PHYSICAL.heatGlow,
        emissiveIntensity: 1.3,
      }),
      heatOff: new THREE.MeshStandardMaterial({ color: PHYSICAL.heatOff, roughness: 0.6 }),
      screen: new THREE.MeshStandardMaterial({
        color: 0x112233,
        emissive: new THREE.Color(palette.info),
        emissiveIntensity: 0.6,
      }),
      skin: new THREE.MeshStandardMaterial({ color: PHYSICAL.skin, roughness: 0.7 }),
      coat: new THREE.MeshStandardMaterial({ color: PHYSICAL.coat, roughness: 0.7 }),
      glove: new THREE.MeshStandardMaterial({ color: PHYSICAL.glove, roughness: 0.6 }),
      beam: new THREE.MeshBasicMaterial({
        color: PHYSICAL.beam,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    }
    this.dotMaterials = {
      ok: new THREE.MeshBasicMaterial({ color: palette.info }),
      warn: new THREE.MeshBasicMaterial({ color: palette.warning }),
    }
    this.lampMaterials = {
      ok: new THREE.MeshBasicMaterial({ color: palette.success }),
      warn: new THREE.MeshBasicMaterial({ color: palette.warning }),
      idle: new THREE.MeshBasicMaterial({ color: palette.muted }),
    }

    this.buildLights()
    this.scene.add(this.room)
    this.pc = this.buildPc()
    this.xray = this.buildXray()
    this.operator = this.buildOperator()
    this.scene.add(this.linkGroup)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(host)
    this.resize()
    this.view('all', true)

    const canvas = this.renderer.domElement
    canvas.addEventListener('pointerdown', this.handleDown)
    canvas.addEventListener('pointerup', this.handleUp)
    canvas.addEventListener('pointermove', this.handleMove)
    this.frameId = requestAnimationFrame(this.frame)
  }

  /** Builds the tanks on the first call or when the baths change, then updates lamps, LEDs and rack. */
  setBaths(baths: BathVisual[]) {
    if (baths.length !== this.tanks.length || baths.some((b, i) => this.tanks[i]?.visual.id !== b.id)) {
      // Keep the tanks that stay, build the new ones (they rise from the floor) and drop the removed ones.
      const first = this.tanks.length === 0
      const kept = new Map(this.tanks.map((t) => [t.visual.id, t]))
      for (const tank of this.tanks) if (!baths.some((b) => b.id === tank.visual.id)) this.removeTank(tank)
      const spacing = spacingFor(baths.length)
      this.tanks = baths.map((b, i) => {
        const x = (i - (baths.length - 1) / 2) * spacing
        const tank = kept.get(b.id) ?? this.buildTank(b, x, first ? 1 : 0)
        tank.targetX = x
        return tank
      })
      this.layoutRoom((baths.length - 1) * spacing)
      this.buildLinks()
      if (!first) this.view(this.currentView)
    }
    baths.forEach((b, i) => {
      const tank = this.tanks[i]!
      if (tank.visual.no !== b.no) drawPlate(tank.plate, b.no)
      tank.visual = b
      tank.lamp.material = this.lampMaterials[b.tone]
      tank.heaters.forEach((h) => (h.material = b.heating ? this.materials.heatOn! : this.materials.heatOff!))
      tank.bubbles.visible = b.running
      tank.steam.visible = (b.tempC ?? 0) > 45
      drawLed(tank.ledVolt, b.running && b.volt !== null ? `${b.volt.toFixed(2)}V` : '--.--', 'RECT')
      drawLed(tank.ledTemp, b.tempC !== null ? `${b.tempC.toFixed(1)}°` : '--.-', 'TEMP')
    })
  }

  /** The PC rekap screen: one block per bath, short lines each. */
  setPcScreen(title: string, blocks: { name: string; lines: string[]; tone: BathVisual['tone'] }[]) {
    const g = this.pc.ctx
    g.fillStyle = this.palette.ink
    g.fillRect(0, 0, 512, 300)
    g.fillStyle = '#ffffff'
    g.font = 'bold 22px "DM Sans", sans-serif'
    g.fillText(title, 18, 36)
    const cw = (512 - 36) / Math.max(1, blocks.length)
    blocks.forEach((b, i) => {
      const x = 18 + i * cw
      g.fillStyle = 'rgba(255,255,255,0.06)'
      g.fillRect(x, 56, cw - 10, 220)
      g.fillStyle =
        b.tone === 'warn' ? this.palette.warning : b.tone === 'ok' ? this.palette.success : this.palette.muted
      g.fillRect(x, 56, cw - 10, 5)
      g.fillStyle = '#ffffff'
      g.font = 'bold 20px "DM Sans", sans-serif'
      g.fillText(b.name, x + 12, 92)
      g.fillStyle = '#c7ccd3'
      g.font = '16px "JetBrains Mono", monospace'
      b.lines.forEach((line, k) => g.fillText(line, x + 12, 128 + k * 30))
    })
    this.pc.texture.needsUpdate = true
  }

  /**
   * A new reading was saved for a bath: the operator walks to it and checks it, takes an X-ray sample when
   * the reading has one, then logs it at the PC while the data packets run from the bath to the PC.
   */
  playReading(bathId: string, withSample: boolean) {
    const tank = this.tanks.find((t) => t.visual.id === bathId)
    if (!tank) return
    const link = this.links.find((l) => l.tank === tank)
    const burst = () => {
      if (link) link.burst = 4
    }
    if (!this.motion) return burst()
    const name = tank.visual.name
    const x = tank.targetX
    const steps: Step[] = [
      {
        status: `menuju ${name}`,
        to: { x: x + 0.25, z: 1.4, face: Math.PI },
        hold: 2.2,
        pose: 'check',
        onArrive: () => (this.openDoor = bathId),
        onDone: () => (this.openDoor = null),
      },
    ]
    if (withSample) {
      steps.push(
        {
          status: `ambil sampel ${name}`,
          hold: 1.6,
          pose: 'dip',
          onArrive: () => (this.openDoor = bathId),
          onDone: () => (this.openDoor = null),
        },
        {
          status: 'bawa sampel ke X-Ray',
          to: XRAY_SPOT,
          hold: 1.4,
          pose: 'load',
          onArrive: () => (this.xray.open = true),
          onDone: () => {
            this.operator.sample.visible = false
            this.xray.sample.visible = true
            this.xray.open = false
            this.xray.scanning = 2.6
          },
        },
        { status: 'menunggu hasil X-Ray', hold: 2.6, pose: 'type' },
      )
    }
    steps.push({ status: `catat ${name} di PC rekap`, to: PC_SPOT, hold: 2, pose: 'type', onArrive: burst })
    const op = this.operator
    op.steps = steps
    op.sample.visible = false
    this.openDoor = null
    this.nextStep()
  }

  /** Flies the camera to the whole room or to one object. */
  view(key: 'all' | PickKey, instant = false) {
    this.currentView = key
    let position: THREE.Vector3
    let target: THREE.Vector3
    if (key === 'pc') {
      position = PC_AT.clone().add(new THREE.Vector3(1.2, 3.4, 4.6))
      target = PC_AT.clone().add(new THREE.Vector3(0, 1.3, 0))
    } else if (key === 'xray') {
      position = XRAY_AT.clone().add(new THREE.Vector3(-1.2, 3.2, 4.4))
      target = XRAY_AT.clone().add(new THREE.Vector3(0, 1, 0))
    } else if (key.startsWith('bath:')) {
      const tank = this.tanks.find((t) => `bath:${t.visual.id}` === key)
      const x = tank?.targetX ?? 0
      position = new THREE.Vector3(x + 2, 4.6, 8.2)
      target = new THREE.Vector3(x, 1.8, 0)
    } else {
      // Pull back for a narrow screen, and far enough that the whole row plus the PC and X-ray fits across.
      const halfFov = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
      const fitRow = (this.rowWidth + 6) / (2 * halfFov * this.camera.aspect) / 14.5
      const far = Math.max(this.camera.aspect < 1 ? 1.6 : this.camera.aspect < 1.4 ? 1.2 : 1, fitRow)
      position = new THREE.Vector3(0.6, 7.4 * far, 12.5 * far)
      target = new THREE.Vector3(0, 1.1, 1.6)
    }
    if (instant || !this.motion) {
      this.camera.position.copy(position)
      this.controls.target.copy(target)
      this.tween = null
    } else {
      this.tween = {
        p0: this.camera.position.clone(),
        t0: this.controls.target.clone(),
        p1: position,
        t1: target,
        s: 0,
      }
    }
  }

  dispose() {
    cancelAnimationFrame(this.frameId)
    this.resizeObserver.disconnect()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointerdown', this.handleDown)
    canvas.removeEventListener('pointerup', this.handleUp)
    canvas.removeEventListener('pointermove', this.handleMove)
    this.controls.dispose()
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      for (const m of Array.isArray(material) ? material : material ? [material] : []) {
        ;(m as THREE.MeshBasicMaterial).map?.dispose()
        m.dispose()
      }
    })
    this.renderer.dispose()
    canvas.remove()
  }

  // ---------- operator ----------

  /** Starts the next queued step, or the next patrol stop when the queue is empty. */
  private nextStep() {
    const op = this.operator
    const step = op.steps.shift() ?? this.patrolStep()
    op.step = step
    op.timer = step.hold ?? 0
    this.onOperator?.(step.status)
    op.path = step.to ? this.route(step.to.x, step.to.z) : []
    if (!step.to) this.arrive()
  }

  /** Patrol: each tank in turn, then the PC. */
  private patrolStep(): Step {
    const op = this.operator
    const tank = this.tanks[op.patrol++ % (this.tanks.length + 1)]
    if (!tank) return { status: 'cek PC rekap', to: PC_SPOT, hold: 2.5, pose: 'type' }
    const id = tank.visual.id
    return {
      status: `patroli ${tank.visual.name}`,
      to: { x: tank.targetX + 0.25, z: 1.4, face: Math.PI },
      hold: 2.4,
      pose: 'check',
      onArrive: () => (this.openDoor = id),
      onDone: () => (this.openDoor = null),
    }
  }

  private arrive() {
    const op = this.operator
    if (!op.step) return
    if (op.step.to) op.face = op.step.to.face
    if (op.step.pose === 'dip') op.sample.visible = true
    op.step.onArrive?.()
  }

  /** Walks along the aisle in front of the tanks instead of cutting through them. */
  private route(x: number, z: number) {
    const p = this.operator.root.position
    const points: [number, number][] = []
    const crossing = Math.abs(p.x - x) > 0.5
    if (crossing && Math.abs(p.z - AISLE_Z) > 0.3) points.push([p.x, AISLE_Z])
    if (crossing && Math.abs(z - AISLE_Z) > 0.3) points.push([x, AISLE_Z])
    points.push([x, z])
    return points.map(([px, pz]) => new THREE.Vector3(px, 0, pz))
  }

  private updateOperator(dt: number) {
    const op = this.operator
    const target = op.path[0]
    if (target) {
      const p = op.root.position
      const d = new THREE.Vector3().subVectors(target, p).setY(0)
      const length = d.length()
      if (length < 0.06) {
        op.path.shift()
        if (!op.path.length) this.arrive()
      } else {
        p.addScaledVector(d.normalize(), Math.min(length, WALK_SPEED * dt))
        op.face = Math.atan2(d.x, d.z)
        op.phase += dt * 8
        const swing = Math.sin(op.phase) * 0.55
        op.legL.rotation.x = swing
        op.legR.rotation.x = -swing
        op.armL.rotation.x = op.sample.visible ? -0.9 : -swing * 0.8
        op.armR.rotation.x = -0.5
      }
    } else {
      op.legL.rotation.x *= 0.8
      op.legR.rotation.x *= 0.8
      const pose = op.step?.pose
      op.armL.rotation.x =
        pose === 'dip'
          ? -1.2 + Math.sin(this.time * 3) * 0.25
          : pose === 'load'
            ? -1.3
            : op.armL.rotation.x * 0.9
      op.armR.rotation.x = pose === 'check' || pose === 'type' ? -1.1 : op.armR.rotation.x * 0.9
      op.timer -= dt
      // No step yet (first frame) or the current pose is done: move on.
      if (!op.step || op.timer <= 0) {
        op.step?.onDone?.()
        this.nextStep()
      }
    }
    let turn = op.face - op.root.rotation.y
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    op.root.rotation.y += turn * Math.min(1, dt * 8)
  }

  // ---------- building ----------

  private buildLights() {
    // Intensities are about π times the legacy values of the source file, for the physical lighting of three r155+.
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x2a3038, 2.4))
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 3.4))
    sun.position.set(-10, 18, 14)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 60 })
    sun.shadow.bias = -0.0004
    this.scene.add(sun)
    const fill = new THREE.DirectionalLight(0x9fc4ff, 1.1)
    fill.position.set(12, 9, -10)
    this.scene.add(fill)
  }

  /** Sizes the floor, walls, fog and shadows to the row of tanks; rebuilds the room only when its width changes. */
  private layoutRoom(rowWidth: number) {
    this.rowWidth = rowWidth
    const width = Math.max(ROOM.w, rowWidth + 10)
    if (width === this.roomWidth) return
    this.roomWidth = width
    const k = width / ROOM.w
    this.scene.fog = new THREE.Fog(this.scene.background as THREE.Color, 28 * k, 60 * k)
    Object.assign(this.sun.shadow.camera, { left: -width / 2, right: width / 2 })
    this.sun.shadow.camera.updateProjectionMatrix()
    this.room.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      ;(mesh.material as THREE.MeshStandardMaterial | undefined)?.map?.dispose()
    })
    this.room.clear()
    this.buildRoom(width)
  }

  private buildRoom(width: number) {
    const tiles = document.createElement('canvas')
    tiles.width = tiles.height = 512
    const g = tiles.getContext('2d')!
    g.fillStyle = PHYSICAL.floor
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        const s = 196 + ((i * 7 + j * 3) % 5) * 3
        g.fillStyle = `rgb(${s},${s + 2},${s})`
        g.fillRect(i * 64 + 1, j * 64 + 1, 62, 62)
      }
    const floorTex = new THREE.CanvasTexture(tiles)
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
    floorTex.repeat.set(width / 4, ROOM.d / 4)
    floorTex.colorSpace = THREE.SRGBColorSpace
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, ROOM.d),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.z = 2
    floor.receiveShadow = true
    this.room.add(floor)

    const wall = new THREE.MeshStandardMaterial({ color: PHYSICAL.wall, roughness: 0.9 })
    const back = this.box(width, 5, 0.3, wall, 0, 2.5, -ROOM.d / 2 + 2)
    back.castShadow = false
    this.room.add(back)
    const side = this.box(0.3, 5, ROOM.d, wall, -width / 2, 2.5, 2)
    side.castShadow = false
    this.room.add(side)

    // Walkway lines in the brand accent, the one highlight of the room.
    const lane = new THREE.MeshBasicMaterial({ color: this.palette.accent, transparent: true, opacity: 0.55 })
    for (const z of [2.3, 3.3]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(width - 3, 0.08), lane)
      line.rotation.x = -Math.PI / 2
      line.position.set(0, 0.012, z)
      this.room.add(line)
    }

    const sign = document.createElement('canvas')
    sign.width = 1024
    sign.height = 128
    const s = sign.getContext('2d')!
    s.fillStyle = this.palette.ink
    s.fillRect(0, 0, 1024, 128)
    s.fillStyle = this.palette.accent
    s.fillRect(0, 118, 1024, 10)
    s.fillStyle = '#ffffff'
    s.font = 'bold 64px "DM Sans", sans-serif'
    s.textAlign = 'center'
    s.fillText('ELECTROFORMING', 512, 84)
    const signTex = new THREE.CanvasTexture(sign)
    signTex.colorSpace = THREE.SRGBColorSpace
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 0.875),
      new THREE.MeshBasicMaterial({ map: signTex }),
    )
    plate.position.set(0, 3.9, -ROOM.d / 2 + 2.17)
    this.room.add(plate)
  }

  private buildTank(visual: BathVisual, x: number, spawn: number): Tank {
    const m = this.materials
    const g = new THREE.Group()
    const W = 1.7
    const D = 1.45
    const y0 = 0.42
    g.add(this.box(W, 0.12, D, m.alu!, 0, 0.06, 0))
    g.add(this.box(W - 0.06, 0.3, D - 0.06, m.white!, 0, 0.27, 0))
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      g.add(this.box(0.07, 2.6, 0.07, m.alu!, (a * W) / 2, 1.3, (b * D) / 2))
    for (const y of [0.42, 1.98, 2.6]) {
      g.add(this.box(W, 0.06, 0.06, m.alu!, 0, y, D / 2))
      g.add(this.box(W, 0.06, 0.06, m.alu!, 0, y, -D / 2))
      g.add(this.box(0.06, 0.06, D, m.alu!, W / 2, y, 0))
      g.add(this.box(0.06, 0.06, D, m.alu!, -W / 2, y, 0))
    }
    for (const [px, pz, w, d] of [
      [0, -D / 2, W, 0.02],
      [W / 2, 0, 0.02, D],
      [-W / 2, 0, 0.02, D],
      [-W / 4, D / 2, W / 2 - 0.06, 0.02],
    ] as const) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(w, 1.55, d), m.glass)
      pane.position.set(px, 1.2, pz)
      g.add(pane)
    }
    // Right front pane is a door, hinged on the right post; it swings open while the operator checks the bath.
    const door = new THREE.Group()
    door.position.set(W / 2 - 0.03, 0, D / 2 + 0.01)
    const doorPane = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.06, 1.5, 0.02), m.glass)
    doorPane.position.set(-W / 4 + 0.03, 1.2, 0)
    door.add(
      doorPane,
      this.box(0.05, 1.5, 0.04, m.alu!, -W / 2 + 0.08, 1.2, 0),
      this.box(0.04, 0.28, 0.05, m.dark!, -W / 2 + 0.16, 1.25, 0.04),
    )
    g.add(door)

    const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.58, 0.8, 32, 1, true), m.tub)
    tub.position.y = y0 + 0.4
    g.add(tub)
    g.add(this.cyl(0.58, 0.58, 0.04, m.tub!, 0, y0 + 0.02, 0, 32))
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.57, 0.63, 32), m.liquid)
    liquid.position.y = y0 + 0.33
    g.add(liquid)
    const heaters = [0, 1, 2].map((k) => {
      const h = this.cyl(0.025, 0.025, 0.6, m.heatOff!, -0.45 + k * 0.05, y0 + 0.38, -0.25, 8)
      g.add(h)
      return h
    })
    const anode = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.02, 6, 32), m.anode)
    anode.rotation.x = Math.PI / 2
    anode.position.y = y0 + 0.45
    g.add(anode)

    g.add(this.box(0.3, 0.18, 0.3, m.dark!, 0, 1.88, 0))
    const rack = new THREE.Group()
    rack.position.set(0, 1.8, 0)
    g.add(rack)
    rack.add(this.cyl(0.025, 0.025, 0.95, m.steel!, 0, -0.45, 0, 8))
    rack.add(this.cyl(0.22, 0.22, 0.28, m.white!, 0, -0.82, 0, 20))
    for (let k = 0; k < 4; k++) {
      const arm = this.box(0.75, 0.035, 0.06, m.steel!, 0, -0.66, 0)
      arm.rotation.y = (k * Math.PI) / 4
      rack.add(arm)
    }
    const gold = Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2
      const piece = this.cyl(0.04, 0.05, 0.18, m.gold!, Math.cos(a) * 0.34, -0.92, Math.sin(a) * 0.34, 8)
      rack.add(piece)
      return piece
    })

    // Control head: blue panel, two LED readouts (volt and temperature), the bath number and a status lamp on top.
    g.add(this.box(W, 0.6, D, m.alu!, 0, 2.3, 0))
    g.add(this.box(W - 0.04, 0.54, 0.03, m.panel!, 0, 2.3, D / 2 + 0.01))
    const ledVolt = makeLed(256, 96)
    const ledTemp = makeLed(256, 96)
    const voltPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.23),
      new THREE.MeshBasicMaterial({ map: ledVolt.texture }),
    )
    voltPlate.position.set(-0.38, 2.3, D / 2 + 0.03)
    const tempPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.23),
      new THREE.MeshBasicMaterial({ map: ledTemp.texture }),
    )
    tempPlate.position.set(0.38, 2.3, D / 2 + 0.03)
    g.add(voltPlate, tempPlate)
    const plate = makeLed(64, 64)
    drawPlate(plate, visual.no)
    const number = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({ map: plate.texture }),
    )
    number.position.set(0, 2.5, D / 2 + 0.03)
    g.add(number)
    g.add(this.box(0.9, 0.42, 0.55, m.white!, 0.15, 2.81, 0.25))
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.14, 16),
      this.lampMaterials[visual.tone],
    )
    lamp.position.set(0.51, 3.1, 0.25)
    g.add(lamp)

    const bubbles = this.particles(
      50,
      () => [rand(-0.5, 0.5), rand(y0 + 0.05, y0 + 0.6), rand(-0.5, 0.5)],
      0.04,
      0.7,
    )
    const steam = this.particles(
      18,
      () => [rand(-0.45, 0.45), rand(y0 + 0.7, y0 + 1.4), rand(-0.45, 0.45)],
      0.12,
      0.2,
    )
    g.add(bubbles, steam)

    g.position.set(x, 0, 0)
    g.scale.y = Math.max(0.001, spawn)
    this.scene.add(g)
    this.markPick(g, `bath:${visual.id}`)
    return {
      visual,
      group: g,
      rack,
      door,
      gold,
      goldSize: 0.6,
      heaters,
      lamp,
      liquid,
      bubbles,
      steam,
      ledVolt,
      ledTemp,
      plate,
      y0,
      targetX: x,
      spawn,
    }
  }

  private removeTank(tank: Tank) {
    this.scene.remove(tank.group)
    tank.group.traverse((o) => {
      this.pickables = this.pickables.filter((p) => p !== o)
      ;(o as THREE.Mesh).geometry?.dispose()
    })
    tank.ledVolt.texture.dispose()
    tank.ledTemp.texture.dispose()
    tank.plate.texture.dispose()
  }

  private buildPc() {
    const m = this.materials
    const g = new THREE.Group()
    g.position.copy(PC_AT)
    g.add(this.box(2.4, 0.08, 1.1, m.wood!, 0, 0.95, 0))
    for (const [x, z] of [
      [-1.1, -0.45],
      [1.1, -0.45],
      [-1.1, 0.45],
      [1.1, 0.45],
    ] as const)
      g.add(this.box(0.07, 0.92, 0.07, m.grey!, x, 0.46, z))
    g.add(this.box(0.08, 0.4, 0.08, m.dark!, 0, 1.2, -0.25))
    g.add(this.box(1.3, 0.78, 0.06, m.dark!, 0, 1.75, -0.27))
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 300
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.69),
      new THREE.MeshBasicMaterial({ map: texture }),
    )
    screen.position.set(0, 1.75, -0.235)
    g.add(screen)
    g.add(this.box(0.25, 0.55, 0.5, m.dark!, 0.95, 1.27, -0.15))
    g.add(this.box(0.7, 0.03, 0.22, m.dark!, 0, 1.0, 0.1))
    this.scene.add(g)
    this.markPick(g, 'pc')
    return { ctx: canvas.getContext('2d')!, texture }
  }

  private buildXray() {
    const m = this.materials
    const g = new THREE.Group()
    g.position.copy(XRAY_AT)
    g.add(this.box(1.5, 0.9, 1.1, m.white!, 0, 0.45, 0))
    g.add(this.box(1.5, 0.08, 1.1, m.grey!, 0, 0.94, 0))
    const lid = new THREE.Group()
    lid.position.set(0, 0.98, -0.5)
    lid.add(this.box(1.3, 0.35, 0.95, m.white!, 0, 0.175, 0.47))
    g.add(lid)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.25, 0.3, 16, 1, true), m.beam)
    beam.position.set(0, 1.12, 0)
    g.add(beam)
    g.add(this.box(0.5, 0.3, 0.05, m.screen!, 0, 0.65, 0.56))
    g.add(this.box(0.3, 0.03, 0.3, m.grey!, 0, 1.0, 0))
    const sample = this.cyl(0.07, 0.08, 0.16, m.gold!, 0, 1.1, 0, 10)
    sample.visible = false
    g.add(sample)
    this.scene.add(g)
    this.markPick(g, 'xray')
    return { lid, beam, sample, open: false, scanning: 0 }
  }

  /** The operator from the source file: coat, cap, a tablet in the right hand and a sample cup in the left. */
  private buildOperator(): Operator {
    const m = this.materials
    const root = new THREE.Group()
    root.position.set(PC_SPOT.x, 0, PC_SPOT.z)
    this.scene.add(root)
    const legL = new THREE.Group()
    const legR = new THREE.Group()
    legL.position.set(-0.13, 0.9, 0)
    legR.position.set(0.13, 0.9, 0)
    for (const leg of [legL, legR])
      leg.add(
        this.box(0.17, 0.85, 0.2, m.navy!, 0, -0.43, 0),
        this.box(0.19, 0.1, 0.3, m.dark!, 0, -0.86, 0.05),
      )
    root.add(legL, legR)
    root.add(this.box(0.52, 0.68, 0.3, m.coat!, 0, 1.25, 0), this.box(0.54, 0.2, 0.32, m.coat!, 0, 0.92, 0))
    const armL = new THREE.Group()
    const armR = new THREE.Group()
    armL.position.set(-0.34, 1.52, 0)
    armR.position.set(0.34, 1.52, 0)
    for (const arm of [armL, armR])
      arm.add(
        this.box(0.13, 0.6, 0.15, m.coat!, 0, -0.3, 0),
        this.box(0.12, 0.12, 0.13, m.glove!, 0, -0.64, 0),
      )
    armR.add(this.box(0.32, 0.22, 0.03, m.dark!, 0, -0.6, 0.12))
    const tablet = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.18), m.screen)
    tablet.position.set(0, -0.6, 0.137)
    armR.add(tablet)
    const sample = this.cyl(0.06, 0.07, 0.15, m.gold!, 0, -0.72, 0.06, 10)
    sample.visible = false
    armL.add(sample)
    root.add(armL, armR)
    root.add(this.cyl(0.15, 0.15, 0.22, m.skin!, 0, 1.78, 0, 12))
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), m.skin)
    head.position.y = 1.98
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.215, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      m.glove,
    )
    cap.position.y = 2.0
    root.add(head, cap)
    root.traverse((o) => (o.castShadow = true))
    return {
      root,
      legL,
      legR,
      armL,
      armR,
      sample,
      path: [],
      face: PC_SPOT.face,
      phase: 0,
      steps: [],
      step: null,
      timer: 0,
      patrol: 0,
    }
  }

  /** Dashed data lines from every tank head to the PC, and from the PC to the X-ray, with moving packets. */
  private buildLinks() {
    this.linkGroup.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    this.linkGroup.clear()
    this.links = []
    const pcTop = PC_AT.clone().add(new THREE.Vector3(0, 2.2, -0.3))
    for (const tank of this.tanks) {
      const x = tank.targetX
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x + 0.15, 3.05, 0.25),
        new THREE.Vector3(x + 0.15, 3.7, 1.2),
        new THREE.Vector3(x * 0.6 + PC_AT.x * 0.4, 3.3, 2.8),
        pcTop,
      ])
      this.addLink(curve, tank)
    }
    this.addLink(
      new THREE.CatmullRomCurve3([
        pcTop.clone().add(new THREE.Vector3(0.4, 0, 0)),
        new THREE.Vector3(0, 2.9, PC_AT.z - 0.8),
        XRAY_AT.clone().add(new THREE.Vector3(0, 1.6, -0.2)),
      ]),
      null,
    )
  }

  private addLink(curve: THREE.CatmullRomCurve3, tank: Tank | null) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)),
      new THREE.LineDashedMaterial({
        color: this.palette.muted,
        dashSize: 0.22,
        gapSize: 0.16,
        transparent: true,
        opacity: 0.6,
      }),
    )
    line.computeLineDistances()
    this.linkGroup.add(line)
    const dots = [0, 1, 2, 3, 4].map(() => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), this.dotMaterials.ok)
      this.linkGroup.add(dot)
      return dot
    })
    this.links.push({ curve, dots, offset: Math.random(), tank, burst: 0 })
  }

  // ---------- loop ----------

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    this.time += dt
    const animate = this.motion
    const ease = (rate: number) => Math.min(1, dt * (animate ? rate : 60))

    if (this.tween) {
      const t = (this.tween.s = Math.min(1, this.tween.s + dt / 0.9))
      const k = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
      this.camera.position.lerpVectors(this.tween.p0, this.tween.p1, k)
      this.controls.target.lerpVectors(this.tween.t0, this.tween.t1, k)
      if (t >= 1) this.tween = null
    }

    for (const tank of this.tanks) {
      const v = tank.visual
      tank.group.position.x += (tank.targetX - tank.group.position.x) * ease(3)
      tank.spawn += (1 - tank.spawn) * ease(2)
      tank.group.scale.y = Math.max(0.001, tank.spawn)
      // Gold pieces grow towards the deposit progress instead of jumping.
      tank.goldSize += (0.6 + 0.6 * Math.min(1, v.progress) - tank.goldSize) * ease(1.5)
      tank.gold.forEach((g) => g.scale.setScalar(tank.goldSize))
      tank.door.rotation.y += ((this.openDoor === v.id ? -1.3 : 0) - tank.door.rotation.y) * ease(4)
      tank.lamp.visible = v.tone !== 'warn' || !animate || Math.floor(this.time * 2) % 2 === 0
      if (!animate) continue
      if (v.running) tank.rack.rotation.y += dt * Math.PI * 0.5
      tank.liquid.position.y = tank.y0 + 0.33 + Math.sin(this.time * 2 + v.no) * 0.006
      rise(tank.bubbles, dt, (k) => 0.25 + (k % 4) * 0.08, tank.y0 + 0.62, tank.y0 + 0.05)
      if (tank.steam.visible) rise(tank.steam, dt, () => 0.35, tank.y0 + 1.45, tank.y0 + 0.63)
    }

    for (const link of this.links) {
      // A saved reading sends a quick, bright burst of packets from the bath to the PC.
      const fast = link.burst > 0
      if (fast) link.burst -= dt
      if (animate) link.offset = (link.offset + dt * (fast ? 0.9 : 0.25)) % 1
      const active = fast || (link.tank ? link.tank.visual.running : true)
      link.dots.forEach((dot, k) => {
        dot.visible = active && (fast || k < 3)
        dot.material = link.tank?.visual.tone === 'warn' ? this.dotMaterials.warn : this.dotMaterials.ok
        dot.scale.setScalar(fast ? 1.4 : 1)
        dot.position.copy(link.curve.getPointAt((link.offset + k / (fast ? 5 : 3)) % 1))
      })
    }

    const x = this.xray
    x.lid.rotation.x += ((x.open ? -1.1 : 0) - x.lid.rotation.x) * ease(4)
    const beam = this.materials.beam as THREE.MeshBasicMaterial
    if (x.scanning > 0) {
      x.scanning -= dt
      beam.opacity = 0.35 + Math.sin(this.time * 12) * 0.25
      if (x.scanning <= 0) x.sample.visible = false
    } else beam.opacity = 0

    if (animate) this.updateOperator(dt)

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.onFrame?.(this.anchors())
    this.frameId = requestAnimationFrame(this.frame)
  }

  /** Screen positions of the label anchors above each tank, the PC and the X-ray. */
  private anchors(): Anchor[] {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    const points: [PickKey, THREE.Vector3][] = [
      ...this.tanks.map((t): [PickKey, THREE.Vector3] => [
        `bath:${t.visual.id}`,
        new THREE.Vector3(t.group.position.x, 0.4 + 3.05 * t.spawn, 0),
      ]),
      ['pc', PC_AT.clone().add(new THREE.Vector3(0, 2.4, -0.3))],
      ['xray', XRAY_AT.clone().add(new THREE.Vector3(0, 1.6, 0))],
    ]
    return points.map(([key, world]) => {
      const depth = this.camera.position.distanceTo(world)
      const v = world.clone().project(this.camera)
      const visible = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15
      return {
        key,
        x: ((v.x + 1) / 2) * w,
        y: ((1 - v.y) / 2) * h,
        visible,
        scale: Math.min(1, Math.max(0.7, 14 / depth)),
        depth,
      }
    })
  }

  private resize() {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  // ---------- picking ----------

  private pickAt(e: PointerEvent): PickKey | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(pointer, this.camera)
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0]
    return (hit?.object.userData.pick as PickKey | undefined) ?? null
  }

  private handleDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY }
  }

  private handleUp = (e: PointerEvent) => {
    // A short press is a click; a longer drag is the user orbiting the camera.
    if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5)
      this.onPick(this.pickAt(e))
    this.down = null
  }

  private handleMove = (e: PointerEvent) => {
    if (!this.down) this.renderer.domElement.style.cursor = this.pickAt(e) ? 'pointer' : 'grab'
  }

  // ---------- helpers ----------

  private markPick(group: THREE.Object3D, key: PickKey) {
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.userData.pick = key
        this.pickables.push(o)
      }
    })
  }

  private box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = mesh.receiveShadow = true
    return mesh
  }

  private cyl(
    rt: number,
    rb: number,
    h: number,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    segments = 20,
  ) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = mesh.receiveShadow = true
    return mesh
  }

  private particles(count: number, place: () => [number, number, number], size: number, opacity: number) {
    const positions = new Float32Array(count * 3)
    for (let k = 0; k < count; k++) positions.set(place(), k * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xffffff, size, transparent: true, opacity, depthWrite: false }),
    )
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Moves particles up and wraps them back to `bottom` once they pass `top`. */
function rise(points: THREE.Points, dt: number, speed: (k: number) => number, top: number, bottom: number) {
  const attr = points.geometry.attributes.position as THREE.BufferAttribute
  for (let k = 0; k < attr.count; k++) {
    let y = attr.getY(k) + dt * speed(k)
    if (y > top) y = bottom
    attr.setY(k, y)
  }
  attr.needsUpdate = true
}

function makeLed(width: number, height: number): Led {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { canvas, ctx: canvas.getContext('2d')!, texture }
}

function drawLed(led: Led, text: string, caption: string) {
  const { ctx: g, canvas } = led
  const W = canvas.width
  const H = canvas.height
  g.fillStyle = PHYSICAL.ledBg
  g.fillRect(0, 0, W, H)
  g.fillStyle = PHYSICAL.led
  g.shadowColor = PHYSICAL.led
  g.shadowBlur = 12
  g.font = `bold ${Math.round(H * 0.58)}px "JetBrains Mono", monospace`
  g.textAlign = 'right'
  g.fillText(text, W - 10, H * 0.78)
  g.shadowBlur = 0
  g.fillStyle = '#ff8a8a'
  g.font = `${Math.round(H * 0.2)}px "DM Sans", sans-serif`
  g.textAlign = 'left'
  g.fillText(caption, 8, H * 0.26)
  led.texture.needsUpdate = true
}

/** The bath number plate on the control head. */
function drawPlate(plate: Led, no: number) {
  const g = plate.ctx
  g.fillStyle = '#f4f4f4'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#111111'
  g.font = 'bold 44px "DM Sans", sans-serif'
  g.textAlign = 'center'
  g.fillText(String(no), 32, 48)
  plate.texture.needsUpdate = true
}
