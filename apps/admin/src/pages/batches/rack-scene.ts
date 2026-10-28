import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** One rack line as the scene draws it. Parts are told apart by what they are on the rack. */
export type RackLine = {
  id: string
  /** Panel the line hangs on: the rack label, '' for the main rack. */
  group: string
  qty: number
  unitAreaDm2: number
  shape: 'ring' | 'drop' | 'plate' | 'wire' | 'hook'
}

// Object colours (tin model, copper, gold, steel), not UI colours.
const PHYSICAL = { tin: 0x8f979e, copper: 0xb87333, gold: 0xe9a92c, steel: 0xc9d0d7, floor: 0x1b1c1e }

const SPACING = 0.14
const ROW_GAP = 0.32
const HOOK = 0.08
const PANEL_GAP = 0.5
const MAX_ROWS = 14

/** Piece radius from its surface area, so a heavy pendant reads bigger than a small earring. */
const pieceSize = (areaDm2: number) => THREE.MathUtils.clamp(0.035 * Math.sqrt(areaDm2 / 0.05), 0.024, 0.062)

type Instanced = { mesh: THREE.InstancedMesh; base: THREE.Color; lineIds: (string | null)[] }
type Solid = { mesh: THREE.Mesh; base: THREE.Color; lineId: string | null }

export class RackScene {
  /** Turns the rack slowly until the viewer drags it. The page sets it from the reduced-motion query. */
  motion = true
  /** Rotation holds while the pointer is over the canvas, so a piece stays under it. */
  private pointerInside = false
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50)
  private controls: OrbitControls
  private env: THREE.Texture
  private rack = new THREE.Group()
  private instanced: Instanced[] = []
  private solids: Solid[] = []
  private bounds = new THREE.Box3()
  private progress = 0
  private highlighted: string | null = null
  private hovered: string | null = null
  private raycaster = new THREE.Raycaster()
  private resizeObserver: ResizeObserver
  private frameId = 0
  private readonly host: HTMLElement
  private readonly onHover: (lineId: string | null, x: number, y: number) => void
  private readonly onPick: (lineId: string | null) => void

  constructor(
    host: HTMLElement,
    background: string,
    onHover: (lineId: string | null, x: number, y: number) => void,
    onPick: (lineId: string | null) => void,
  ) {
    this.host = host
    this.onHover = onHover
    this.onPick = onPick
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'
    host.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(background)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = this.env
    this.scene.environmentIntensity = 0.45
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(2, 4, 3)
    this.scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x404040, 0.3))
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshStandardMaterial({ color: PHYSICAL.floor, roughness: 0.9 }),
    )
    floor.rotation.x = -Math.PI / 2
    this.scene.add(floor, this.rack)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI * 0.55
    this.controls.minDistance = 0.4
    this.controls.maxDistance = 12
    this.controls.autoRotateSpeed = 0.8
    this.controls.addEventListener('start', () => (this.motion = false))

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(host)
    this.resize()

    const canvas = this.renderer.domElement
    canvas.addEventListener('pointermove', this.handleMove)
    canvas.addEventListener('pointerleave', this.handleLeave)
    canvas.addEventListener('click', this.handleClick)
    this.frameId = requestAnimationFrame(this.frame)
  }

  /** Rebuilds the rack from the load lines and frames it. */
  setRack(lines: RackLine[]) {
    this.clearRack()
    const pieces = lines.filter((l) => l.shape === 'ring' || l.shape === 'drop')
    const groups = [...new Set(pieces.map((l) => l.group))]
    if (groups.length === 0) return
    const plates = lines.filter((l) => l.shape === 'plate')
    const wireId = lines.find((l) => l.shape === 'wire')?.id ?? null
    const hookId = lines.find((l) => l.shape === 'hook')?.id ?? null

    const layouts = groups.map((group) => {
      const own = pieces.filter((l) => l.group === group)
      const count = own.reduce((sum, l) => sum + Math.max(0, Math.round(l.qty)), 0)
      const rows = THREE.MathUtils.clamp(Math.round(Math.sqrt(count / 2.5)), 1, MAX_ROWS)
      const cols = Math.max(1, Math.ceil(count / rows))
      return { group, own, count, rows, cols, width: cols * SPACING + 0.16 }
    })
    // Plates hang under the first panel unless their label names another one.
    const plateGroup = (l: RackLine) => (groups.includes(l.group) ? l.group : groups[0])
    const totalWidth = layouts.reduce((sum, p) => sum + p.width, 0) + PANEL_GAP * (layouts.length - 1)
    const tallest = Math.max(
      ...layouts.map((p) => p.rows * ROW_GAP + (plates.some((l) => plateGroup(l) === p.group) ? 0.5 : 0)),
    )
    const top = tallest + 0.45

    const ringGeo = new THREE.TorusGeometry(1, 0.24, 10, 24)
    const dropGeo = new THREE.SphereGeometry(1, 16, 12)
    const hookGeo = new THREE.CylinderGeometry(0.004, 0.004, 1, 5)
    const total = layouts.reduce((sum, p) => sum + p.count, 0)
    const rings = this.addInstanced(ringGeo, total, PHYSICAL.tin)
    const drops = this.addInstanced(dropGeo, total, PHYSICAL.tin)
    const hooks = this.addInstanced(hookGeo, total, PHYSICAL.steel)
    const steel = new THREE.MeshStandardMaterial({ color: PHYSICAL.steel, metalness: 0.8, roughness: 0.3 })
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const s = new THREE.Vector3()

    let x0 = -totalWidth / 2
    for (const panel of layouts) {
      const cx = x0 + panel.width / 2
      // Frame: two posts, a top bar and the hanger the crane lifts.
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, top, 8), steel)
        post.position.set(cx + (side * panel.width) / 2, top / 2, 0)
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.24), steel)
        foot.position.set(post.position.x, 0.01, 0)
        this.rack.add(post, foot)
      }
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, panel.width, 8), steel)
      head.rotation.z = Math.PI / 2
      head.position.set(cx, top, 0)
      const hanger = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 20, Math.PI), steel)
      hanger.position.set(cx, top, 0)
      this.rack.add(head, hanger)
      if (groups.length > 1)
        this.rack.add(this.label(panel.group ? `Rak ${panel.group}` : 'Rak', cx, top + 0.2))

      // Copper wire rows; each piece hangs from its own SS hook.
      const rowY = (r: number) => top - 0.22 - r * ROW_GAP
      for (let r = 0; r < panel.rows; r++) {
        const bar = this.addSolid(
          new THREE.CylinderGeometry(0.005, 0.005, panel.width, 6),
          PHYSICAL.copper,
          wireId,
        )
        bar.rotation.z = Math.PI / 2
        bar.position.set(cx, rowY(r), 0)
      }
      let k = 0
      for (const line of panel.own) {
        const size = pieceSize(line.unitAreaDm2)
        const target = line.shape === 'ring' ? rings : drops
        for (let n = 0; n < Math.round(line.qty); n++, k++) {
          const r = Math.floor(k / panel.cols)
          const x = cx - panel.width / 2 + 0.08 + SPACING / 2 + (k % panel.cols) * SPACING
          const y = rowY(r)
          m.compose(v.set(x, y - HOOK / 2, 0), q.identity(), s.set(1, HOOK, 1))
          this.pushInstance(hooks, m, hookId)
          if (line.shape === 'ring') s.setScalar(size)
          else s.set(size * 0.75, size * 1.15, size * 0.45)
          m.compose(v.set(x, y - HOOK - s.y, 0), q.identity(), s)
          this.pushInstance(target, m, line.id)
        }
      }

      const panelPlates = plates.filter((l) => plateGroup(l) === panel.group)
      const plateCount = panelPlates.reduce((sum, l) => sum + Math.max(1, Math.round(l.qty)), 0)
      let p = 0
      for (const line of panelPlates) {
        for (let n = 0; n < Math.max(1, Math.round(line.qty)); n++, p++) {
          const plate = this.addSolid(new THREE.BoxGeometry(0.16, 0.24, 0.006), PHYSICAL.copper, line.id)
          plate.position.set(cx + (p - (plateCount - 1) / 2) * 0.22, rowY(panel.rows) - 0.12, 0)
        }
      }
      x0 += panel.width + PANEL_GAP
    }
    for (const i of this.instanced) {
      i.mesh.count = i.lineIds.length
      i.mesh.computeBoundingSphere()
    }
    this.bounds.setFromObject(this.rack)
    this.paint()
    this.fit()
  }

  /** Deposit towards target, 0 to 1: the plated surfaces turn from tin and copper to gold. */
  setProgress(progress: number) {
    this.progress = THREE.MathUtils.clamp(progress, 0, 1)
    this.paint()
  }

  /** Dims every line but this one; null shows the whole rack. */
  highlight(lineId: string | null) {
    this.highlighted = lineId
    this.paint()
  }

  /** Frames the whole rack from the front, a little above. */
  fit() {
    if (this.bounds.isEmpty()) return
    const center = this.bounds.getCenter(new THREE.Vector3())
    const size = this.bounds.getSize(new THREE.Vector3())
    const fov = THREE.MathUtils.degToRad(this.camera.fov)
    const fitH = size.y / 2 / Math.tan(fov / 2)
    const fitW = size.x / 2 / Math.tan(fov / 2) / this.camera.aspect
    const dist = Math.max(fitH, fitW) * 1.15 + size.z
    this.camera.position.set(center.x + dist * 0.25, center.y + dist * 0.15, center.z + dist)
    this.controls.target.copy(center)
    this.controls.update()
  }

  dispose() {
    cancelAnimationFrame(this.frameId)
    this.resizeObserver.disconnect()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointermove', this.handleMove)
    canvas.removeEventListener('pointerleave', this.handleLeave)
    canvas.removeEventListener('click', this.handleClick)
    this.controls.dispose()
    disposeTree(this.scene)
    this.env.dispose()
    this.renderer.dispose()
    canvas.remove()
  }

  private paint() {
    const gold = new THREE.Color(PHYSICAL.gold)
    const color = new THREE.Color()
    const tone = (base: THREE.Color, lineId: string | null) => {
      color.copy(base).lerp(gold, this.progress)
      if (this.highlighted && lineId !== this.highlighted) color.multiplyScalar(0.18)
      else if (lineId && lineId === this.hovered) color.offsetHSL(0, 0, 0.12)
      return color
    }
    for (const i of this.instanced) {
      i.lineIds.forEach((id, n) => i.mesh.setColorAt(n, tone(i.base, id)))
      if (i.mesh.instanceColor) i.mesh.instanceColor.needsUpdate = true
      const material = i.mesh.material as THREE.MeshStandardMaterial
      material.metalness = 0.45 + 0.55 * this.progress
      material.roughness = 0.5 - 0.3 * this.progress
    }
    for (const solid of this.solids) {
      const material = solid.mesh.material as THREE.MeshStandardMaterial
      material.color.copy(tone(solid.base, solid.lineId))
      material.roughness = 0.45 - 0.25 * this.progress
    }
  }

  private addInstanced(geometry: THREE.BufferGeometry, capacity: number, base: number): Instanced {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.5 })
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity))
    mesh.count = 0
    this.rack.add(mesh)
    const entry = { mesh, base: new THREE.Color(base), lineIds: [] }
    this.instanced.push(entry)
    return entry
  }

  private pushInstance(target: Instanced, matrix: THREE.Matrix4, lineId: string | null) {
    target.mesh.setMatrixAt(target.lineIds.length, matrix)
    target.lineIds.push(lineId)
  }

  private addSolid(geometry: THREE.BufferGeometry, base: number, lineId: string | null) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ metalness: 0.9 }))
    this.rack.add(mesh)
    this.solids.push({ mesh, base: new THREE.Color(base), lineId })
    return mesh
  }

  private label(text: string, x: number, y: number) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 40px "DM Sans", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text.length > 12 ? `${text.slice(0, 11)}…` : text, 128, 32)
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthWrite: false }),
    )
    sprite.scale.set(0.8, 0.2, 1)
    sprite.position.set(x, y, 0)
    return sprite
  }

  private clearRack() {
    disposeTree(this.rack)
    this.rack.clear()
    this.instanced = []
    this.solids = []
    this.bounds.makeEmpty()
  }

  private pick(event: PointerEvent | MouseEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(pointer, this.camera)
    const targets = [...this.instanced.map((i) => i.mesh), ...this.solids.map((s) => s.mesh)]
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    if (!hit) return null
    const inst = this.instanced.find((i) => i.mesh === hit.object)
    if (inst) return hit.instanceId === undefined ? null : (inst.lineIds[hit.instanceId] ?? null)
    return this.solids.find((s) => s.mesh === hit.object)?.lineId ?? null
  }

  private handleMove = (event: PointerEvent) => {
    this.pointerInside = true
    if (event.buttons) return
    const id = this.pick(event)
    if (id !== this.hovered) {
      this.hovered = id
      this.renderer.domElement.style.cursor = id ? 'pointer' : ''
      this.paint()
    }
    const rect = this.host.getBoundingClientRect()
    this.onHover(id, event.clientX - rect.left, event.clientY - rect.top)
  }

  private handleLeave = () => {
    this.pointerInside = false
    this.hovered = null
    this.paint()
    this.onHover(null, 0, 0)
  }

  private handleClick = (event: MouseEvent) => this.onPick(this.pick(event))

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private frame = () => {
    this.controls.autoRotate = this.motion && !this.pointerInside
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.frameId = requestAnimationFrame(this.frame)
  }
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    mesh.geometry?.dispose()
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    for (const mat of Array.isArray(material) ? material : material ? [material] : []) {
      ;(mat as THREE.MeshBasicMaterial).map?.dispose()
      mat.dispose()
    }
  })
}
