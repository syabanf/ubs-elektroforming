import type { Bath, Batch, GpcEntry, LoadLine, Model, Prep, RackPart, Reading } from '@ef/types'
import seedBatches from '../data/batches.json' with { type: 'json' }
import seedGpc from '../data/gpc.json' with { type: 'json' }
import seedModels from '../data/models.json' with { type: 'json' }
import seedParts from '../data/parts.json' with { type: 'json' }
import { toLocalIso } from './engine'

/** The baths of the trial line, the starting point of the editable bath list. */
export const DEFAULT_BATHS: Bath[] = [
  { id: 'bak-1', name: 'Bak 1', description: 'Bak electroforming Au-Cu, lini trial SCADA' },
  { id: 'bak-2', name: 'Bak 2', description: 'Bak electroforming Au-Cu, lini produksi' },
]

export type AppState = {
  baths: Bath[]
  batches: Batch[]
  models: Model[]
  parts: RackPart[]
  gpc: { initialAuG: number; entries: GpcEntry[] }
}

/** What the operator types to open a batch; the rest starts from the house defaults. */
export type NewBatch = Pick<Batch, 'code' | 'bathId' | 'startDate' | 'targetMicron'> & {
  targetAuPct: number
  note: string
}
export type BatchSettings = Partial<Omit<Batch, 'id' | 'code' | 'status' | 'readings' | 'prep'>>
export type PrepPatch = Partial<Omit<Prep, 'load'>>
export type ReadingInput = Omit<Reading, 'id'>
export type StartInput = { startDate: string; initialAu: number; initialThicknessMm: number }

export type AppAction =
  | { type: 'batches/create'; batch: NewBatch }
  | { type: 'batches/update'; id: string; patch: BatchSettings }
  | { type: 'batches/updatePrep'; id: string; patch: PrepPatch }
  | { type: 'batches/saveLine'; batchId: string; line: LoadLine }
  | { type: 'batches/removeLine'; batchId: string; lineId: string }
  | { type: 'batches/start'; id: string; start: StartInput }
  | { type: 'batches/complete'; id: string }
  | { type: 'batches/reopen'; id: string }
  | { type: 'batches/remove'; id: string }
  | { type: 'readings/add'; batchId: string; reading: ReadingInput }
  | { type: 'readings/update'; batchId: string; readingId: string; reading: ReadingInput }
  | { type: 'readings/remove'; batchId: string; readingId: string }
  | { type: 'models/save'; model: Model }
  | { type: 'models/remove'; id: string }
  | { type: 'parts/save'; part: RackPart }
  | { type: 'baths/save'; bath: Bath }
  | { type: 'baths/remove'; id: string }
  | { type: 'gpc/save'; entry: GpcEntry }
  | { type: 'gpc/remove'; id: string }
  | { type: 'gpc/setInitial'; grams: number }

/** Sample bath limits, used until the plant sets its own standard. */
export const SAMPLE_LIMITS = { phMin: 9.5, phMax: 10.5, tempMin: 60, tempMax: 65 }

/** Minutes before load time that a running sample batch was last logged. */
const SAMPLE_LAST_LOG_MIN = 40

export function seedState(now = new Date()): AppState {
  const state: AppState = structuredClone({
    baths: DEFAULT_BATHS,
    batches: seedBatches as Batch[],
    models: seedModels as Model[],
    parts: seedParts as RackPart[],
    gpc: seedGpc as AppState['gpc'],
  })
  for (const batch of state.batches)
    if (batch.status === 'running' && batch.conditionIsSample) anchorSampleTimes(batch, now)
  return state
}

/** Moves a running batch's sample clock times so its last log was a little before `now`, which keeps the reminder live. */
function anchorSampleTimes(batch: Batch, now: Date) {
  const last = batch.readings.findLast((r) => r.recordedAt)?.recordedAt
  if (!last) return
  const shift = now.getTime() - SAMPLE_LAST_LOG_MIN * 60000 - Date.parse(last)
  for (const r of batch.readings)
    if (r.recordedAt) r.recordedAt = toLocalIso(new Date(Date.parse(r.recordedAt) + shift))
}

export const batchIdFor = (code: string) =>
  `bt-${code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`

export const bathName = (baths: Bath[], bathId: string) => baths.find((b) => b.id === bathId)?.name ?? bathId

/** Id for a new bath: `bak-3` from "Bak 3", with a suffix when that id is taken. */
export function bathIdFor(baths: Bath[], name: string) {
  const base = `bak-${
    name
      .trim()
      .toLowerCase()
      .replace(/^bak\s*/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'baru'
  }`
  let id = base
  for (let n = 2; baths.some((b) => b.id === id); n++) id = `${base}-${n}`
  return id
}

/** "Bak 3" after Bak 1 and Bak 2. */
export function nextBathName(baths: Bath[]) {
  const numbers = baths.map((b) => Number(/^Bak\s+(\d+)$/i.exec(b.name)?.[1] ?? 0))
  return `Bak ${Math.max(0, ...numbers) + 1}`
}

export function bathSaveBlocker(state: AppState, bath: Bath): string | null {
  if (!bath.name.trim()) return 'Isi nama bak.'
  const clash = state.baths.find(
    (b) => b.id !== bath.id && b.name.trim().toLowerCase() === bath.name.trim().toLowerCase(),
  )
  return clash ? `Nama ${clash.name} sudah dipakai.` : null
}

export function bathRemoveBlocker(state: AppState, id: string): string | null {
  const used = state.batches.filter((b) => b.bathId === id).length
  if (used) return `${bathName(state.baths, id)} dipakai ${used} batch. Pindahkan atau hapus batchnya dulu.`
  return state.baths.length <= 1 ? 'Sistem butuh minimal satu bak.' : null
}

export function runningBatchIn(state: AppState, bathId: string, exceptId?: string) {
  return state.batches.find((b) => b.bathId === bathId && b.status === 'running' && b.id !== exceptId)
}

/** A new batch with the defaults the workbooks use: 140 L bath, 95 % efficiency, X-ray band 71.5–72.5 %. */
export function newBatch(input: NewBatch): Batch {
  const code = input.code.trim()
  return {
    id: batchIdFor(code),
    code,
    bathId: input.bathId,
    startDate: input.startDate,
    status: 'preparing',
    targetMicron: input.targetMicron,
    initialAu: null,
    initialThicknessMm: null,
    surfaceAreaDm2: null,
    theoreticalAmm: null,
    refAuMin: 0.715,
    refAuMax: 0.725,
    targetAu: input.targetAuPct / 100,
    ...SAMPLE_LIMITS,
    conditionIsSample: false,
    note: input.note,
    readings: [],
    prep: {
      date: input.startDate,
      targetAuPct: input.targetAuPct,
      bathVolumeL: 140,
      efficiencyPct: 95,
      totalAmmReal: null,
      actualMicron: null,
      actualAuPct: null,
      gpcAddedG: null,
      chem: {
        auStart: null,
        auEnd: null,
        cuStart: null,
        cuEnd: null,
        kcnStart: null,
        kcnEnd: null,
        kcnTarget: 13,
      },
      pretreat: { basaCu: null, basaKcn: null, asamCu: null, asamH2so4: null },
      load: [],
    },
  }
}

// Blockers: the reducer refuses the action with the same sentence the UI shows.

export function batchCreateBlocker(state: AppState, code: string): string | null {
  if (!code.trim()) return 'Isi kode batch.'
  return state.batches.some((b) => b.id === batchIdFor(code))
    ? `Kode batch ${code.trim()} sudah dipakai.`
    : null
}

export function batchStartBlocker(state: AppState, batch: Batch): string | null {
  if (batch.status !== 'preparing') return 'Batch ini sudah pernah dimulai.'
  if (batch.prep.load.length === 0 && batch.surfaceAreaDm2 === null)
    return 'Isi rak dulu supaya luas permukaan diketahui.'
  const running = runningBatchIn(state, batch.bathId)
  return running
    ? `${bathName(state.baths, batch.bathId)} masih dipakai batch ${running.code}. Selesaikan batch itu dulu.`
    : null
}

export function batchCompleteBlocker(batch: Batch): string | null {
  if (batch.status !== 'running') return 'Batch ini sedang tidak berjalan.'
  return batch.readings.length === 0 ? 'Catat minimal satu pembacaan sebelum menyelesaikan batch.' : null
}

export function batchReopenBlocker(state: AppState, batch: Batch): string | null {
  const running = runningBatchIn(state, batch.bathId, batch.id)
  return running ? `${bathName(state.baths, batch.bathId)} sedang dipakai batch ${running.code}.` : null
}

export function readingBlocker(batch: Batch): string | null {
  if (batch.status === 'preparing') return 'Mulai proses dulu sebelum mencatat pembacaan.'
  return batch.status === 'completed' ? 'Batch sudah selesai. Buka kembali untuk mengubah pembacaan.' : null
}

export function modelRemoveBlocker(state: AppState, id: string): string | null {
  const used = state.batches.filter((b) => b.prep.load.some((l) => l.modelId === id))
  return used.length ? `Model ini ada di rak batch ${used.map((b) => b.code).join(', ')}.` : null
}

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

const withBatch = (state: AppState, id: string, change: (b: Batch) => Batch): AppState => ({
  ...state,
  batches: state.batches.map((b) => (b.id === id ? change(b) : b)),
})

const withPrep = (state: AppState, id: string, change: (p: Prep) => Prep) =>
  withBatch(state, id, (b) => ({ ...b, prep: change(b.prep) }))

function readingIdFor(batch: Batch, no: number) {
  const base = `rd-${batch.id.slice(3)}-${String(no).padStart(2, '0')}`
  const taken = new Set(batch.readings.map((r) => r.id))
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/** Readings keep their order by `no`, so an edit that changes the number re-sorts the log. */
const sorted = (readings: Reading[]) => [...readings].sort((a, b) => a.no - b.no)

export function reduce(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'batches/create':
      if (batchCreateBlocker(state, action.batch.code)) return state
      return { ...state, batches: [newBatch(action.batch), ...state.batches] }
    case 'batches/update':
      return withBatch(state, action.id, (b) => ({ ...b, ...action.patch }))
    case 'batches/updatePrep':
      return withPrep(state, action.id, (p) => ({ ...p, ...action.patch }))
    case 'batches/saveLine':
      return withPrep(state, action.batchId, (p) => ({ ...p, load: upsert(p.load, action.line) }))
    case 'batches/removeLine':
      return withPrep(state, action.batchId, (p) => ({
        ...p,
        load: p.load.filter((l) => l.id !== action.lineId),
      }))
    case 'batches/start': {
      const batch = state.batches.find((b) => b.id === action.id)
      if (!batch || batchStartBlocker(state, batch)) return state
      return withBatch(state, action.id, (b) => ({ ...b, ...action.start, status: 'running' }))
    }
    case 'batches/complete': {
      const batch = state.batches.find((b) => b.id === action.id)
      if (!batch || batchCompleteBlocker(batch)) return state
      return withBatch(state, action.id, (b) => ({ ...b, status: 'completed' }))
    }
    case 'batches/reopen': {
      const batch = state.batches.find((b) => b.id === action.id)
      if (!batch || batch.status !== 'completed' || batchReopenBlocker(state, batch)) return state
      return withBatch(state, action.id, (b) => ({ ...b, status: 'running' }))
    }
    case 'batches/remove':
      return { ...state, batches: state.batches.filter((b) => b.id !== action.id) }
    case 'readings/add':
    case 'readings/update':
    case 'readings/remove': {
      const batch = state.batches.find((b) => b.id === action.batchId)
      if (!batch || readingBlocker(batch)) return state
      return withBatch(state, action.batchId, (b) => {
        if (action.type === 'readings/remove')
          return { ...b, readings: b.readings.filter((r) => r.id !== action.readingId) }
        if (action.type === 'readings/update') {
          return {
            ...b,
            readings: sorted(
              b.readings.map((r) => (r.id === action.readingId ? { ...action.reading, id: r.id } : r)),
            ),
          }
        }
        return {
          ...b,
          readings: sorted([...b.readings, { ...action.reading, id: readingIdFor(b, action.reading.no) }]),
        }
      })
    }
    case 'models/save':
      return { ...state, models: upsert(state.models, action.model) }
    case 'models/remove':
      if (modelRemoveBlocker(state, action.id)) return state
      return { ...state, models: state.models.filter((m) => m.id !== action.id) }
    case 'parts/save':
      return { ...state, parts: upsert(state.parts, action.part) }
    case 'baths/save':
      if (bathSaveBlocker(state, action.bath)) return state
      return { ...state, baths: upsert(state.baths, { ...action.bath, name: action.bath.name.trim() }) }
    case 'baths/remove':
      if (bathRemoveBlocker(state, action.id)) return state
      return { ...state, baths: state.baths.filter((b) => b.id !== action.id) }
    case 'gpc/save':
      return { ...state, gpc: { ...state.gpc, entries: upsert(state.gpc.entries, action.entry) } }
    case 'gpc/remove':
      return { ...state, gpc: { ...state.gpc, entries: state.gpc.entries.filter((e) => e.id !== action.id) } }
    case 'gpc/setInitial':
      return { ...state, gpc: { ...state.gpc, initialAuG: action.grams } }
  }
}

export const nextReadingNo = (batch: Batch) => batch.readings.reduce((max, r) => Math.max(max, r.no), 0) + 1

export const catalogOf = (state: Pick<AppState, 'models' | 'parts'>) => ({
  models: new Map(state.models.map((m) => [m.id, m])),
  parts: new Map(state.parts.map((p) => [p.id, p])),
})
