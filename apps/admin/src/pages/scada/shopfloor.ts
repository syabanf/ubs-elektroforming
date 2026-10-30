import {
  type ScadaMachineId,
  type ScadaSample,
  type ScadaUnit,
  SCADA_MACHINES,
  SCADA_STALE_SEC,
  sampleAgeSec,
} from '@ef/fixtures'

/** A rectangle on the floor in metres: x to the right, z from the back wall towards the aisle. */
export type Rect = { x: number; z: number; w: number; d: number }
export type Point = [x: number, z: number]

export type Shopfloor = {
  room: { w: number; d: number }
  zones: (Rect & { machine: ScadaMachineId; name: string })[]
  units: (Rect & { unit: ScadaUnit })[]
  /** One SCADA module on its pole per machine. */
  modules: (Rect & { machine: ScadaMachineId })[]
  pc: Rect
  /** Serial cables from each unit to its machine's module. */
  serial: { unitId: string; path: Point[] }[]
  /** Network cables from each module to the mini PC. */
  network: { machine: ScadaMachineId; path: Point[] }[]
}

// The plan is a schematic, not a survey: tanks are drawn large so their values fit inside them.
const MARGIN = 0.5
const GAP = 1
const PAD = 0.4
/** Room for the zone name above its tanks. */
const HEAD = 0.9
const SIZE: Record<ScadaMachineId, { w: number; d: number }> = {
  ef: { w: 3.4, d: 3.1 },
  tembaga: { w: 3, d: 3.1 },
}
const MODULE = 0.7
const UNIT_GAP = 0.4

/** One zone per machine, left to right, with the SCADA module at the right end and the mini PC in the aisle. */
export function shopfloorLayout(units: ScadaUnit[]): Shopfloor {
  const zones: Shopfloor['zones'] = []
  const placed: Shopfloor['units'] = []
  const modules: Shopfloor['modules'] = []
  const serial: Shopfloor['serial'] = []
  let x = MARGIN
  for (const machine of SCADA_MACHINES) {
    const own = units.filter((u) => u.machine === machine.id)
    const { w, d } = SIZE[machine.id]
    const z = MARGIN + HEAD
    own.forEach((unit, i) => placed.push({ unit, x: x + PAD + i * (w + UNIT_GAP), z, w, d }))
    const moduleX = x + PAD + own.length * (w + UNIT_GAP)
    const module = {
      machine: machine.id,
      x: moduleX,
      z: z + (d - MODULE) / 2,
      w: MODULE,
      d: MODULE,
    }
    modules.push(module)
    const zoneW = moduleX + MODULE + PAD - x
    zones.push({ machine: machine.id, name: machine.name, x, z: MARGIN, w: zoneW, d: HEAD + d + PAD })
    // Under the tanks to the module, along the front of the zone.
    const trayZ = z + d + 0.3
    for (const u of placed.slice(-own.length))
      serial.push({
        unitId: u.unit.id,
        path: [
          [u.x + u.w / 2, u.z + u.d],
          [u.x + u.w / 2, trayZ],
          [moduleX + MODULE / 2, trayZ],
          [moduleX + MODULE / 2, module.z + MODULE],
        ],
      })
    x += zoneW + GAP
  }
  const roomW = x - GAP + MARGIN
  const zoneBottom = Math.max(...zones.map((z) => z.z + z.d))
  const aisleZ = zoneBottom + 0.7
  const pc = { x: roomW / 2 - 1.6, z: zoneBottom + 1.4, w: 3.2, d: 1 }
  const network = modules.map((m) => ({
    machine: m.machine,
    path: [
      [m.x + m.w / 2, m.z + m.d],
      [m.x + m.w / 2, aisleZ],
      [pc.x + pc.w / 2, aisleZ],
      [pc.x + pc.w / 2, pc.z],
    ] satisfies Point[],
  }))
  return {
    room: { w: roomW, d: pc.z + pc.d + MARGIN },
    zones,
    units: placed,
    modules,
    pc,
    serial,
    network,
  }
}

export type UnitState = 'live' | 'stale' | 'none'

export const unitState = (sample: ScadaSample | undefined, now: Date): UnitState =>
  !sample ? 'none' : sampleAgeSec(sample, now) > SCADA_STALE_SEC ? 'stale' : 'live'
