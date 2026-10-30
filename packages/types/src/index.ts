/** A plating tank on the line. */
export type Bath = { id: string; name: string; description: string }

/** What the rack's models are made of; the gold plates onto tin or onto wax. */
export type ModelMaterial = 'tin' | 'wax'

export const MODEL_MATERIAL_LABEL: Record<ModelMaterial, string> = { tin: 'Timah', wax: 'Lilin' }

/** A batch is prepared (rack and solution), then runs in a bath, then is finished. */
export type BatchStatus = 'preparing' | 'running' | 'completed'

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  preparing: 'Persiapan',
  running: 'Berjalan',
  completed: 'Selesai',
}

export const BATCH_STATUS_FLOW: BatchStatus[] = ['preparing', 'running', 'completed']

/**
 * One operator log row, the way the spreadsheet records it. Composition comes from the X-ray reading
 * (fraction of Au, 0.72 = 72 %); thickness is the plate measured with a micrometer, in mm.
 */
export type Reading = {
  id: string
  no: number
  minutes: number | null
  volt: number | null
  ampere: number | null
  /** Set target current density for the interval, A/dm². */
  setTargetAdm2: number | null
  /** Cumulative ampere-minute meter reading. */
  ammReal: number | null
  au: number | null
  thicknessMm: number | null
  /** Clock time of the reading, local `YYYY-MM-DDTHH:mm`. Imported Excel rows have none. */
  recordedAt: string | null
  ph: number | null
  /** Bath temperature, °C. */
  tempC: number | null
  /** 'scada' when the operator kept values the SCADA module sent; imported rows have none. */
  source?: 'manual' | 'scada'
}

/** Master Luas Permukaan: one product model with its plated surface. */
export type Model = {
  id: string
  code: string
  /** Base design shared by the sizes of a ring family (CH4222 for "CH4222 (12)"). */
  family: string
  size: number | null
  areaDm2: number
  /** Raw tin model weighings in grams; the tin weight is their mean minus the sprue tare. */
  tinWeighings: number[]
  tinWeightG: number | null
  image: string | null
  note: string
}

/** A rack component that goes into the bath with every load (plate, wires). */
export type RackPart = { id: string; name: string; areaDm2: number }

/** One line of the rack load: a model or a rack part, with the weighings of the line. */
export type LoadLine = {
  id: string
  modelId: string | null
  partId: string | null
  /** Rack position or group, such as "A" or "B". */
  label: string
  qty: number
  weightStartG: number | null
  weightAfterAcidG: number | null
  weightFinalG: number | null
}

/** Lab results in g/L for the gold bath, before (start) and after (end) the run. */
export type BathChemistry = {
  auStart: number | null
  auEnd: number | null
  cuStart: number | null
  cuEnd: number | null
  kcnStart: number | null
  kcnEnd: number | null
  kcnTarget: number | null
  /** When the lab tested the start and end samples, local `YYYY-MM-DDTHH:mm`. Imported batches have none. */
  startAt?: string | null
  endAt?: string | null
}

/** Lab results in g/L for the copper pre-treatment tanks. */
export type Pretreatment = {
  basaCu: number | null
  basaKcn: number | null
  asamCu: number | null
  asamH2so4: number | null
}

/** Preparation of a batch (the "Data Sheet" of the area workbook): rack load, solution and lab results. */
export type Prep = {
  date: string
  /** Alloy the product should have; drives the GPC and CuCN needs. */
  targetAuPct: number
  bathVolumeL: number
  /** Current efficiency assumed for the theoretical AMM, %. */
  efficiencyPct: number
  /** Total meter reading at the end, for batches without a reading log. */
  totalAmmReal: number | null
  /** Measured thickness at the end, for batches without a reading log. */
  actualMicron: number | null
  actualAuPct: number | null
  gpcAddedG: number | null
  chem: BathChemistry
  pretreat: Pretreatment
  load: LoadLine[]
}

/** One electroforming run in a bath: preparation, the reading log and the result. */
export type Batch = {
  id: string
  code: string
  bathId: string
  startDate: string
  status: BatchStatus
  targetMicron: number
  /** Chosen when the batch is created; batches imported from the sheets have none. */
  modelMaterial?: ModelMaterial
  /** Kadar awal: Au fraction of the bath when the run starts (X-ray). */
  initialAu: number | null
  /** Plate thickness before plating, mm. */
  initialThicknessMm: number | null
  /** Typed surface area, used only while the rack has no load lines. */
  surfaceAreaDm2: number | null
  /** Typed theoretical AMM, used only while the rack has no load lines. */
  theoreticalAmm: number | null
  refAuMin: number
  refAuMax: number
  /** X-ray middle target the volt advice steers to (fraction). */
  targetAu: number
  /** Optional safe ranges for the bath; the screens flag readings outside them. */
  phMin: number | null
  phMax: number | null
  tempMin: number | null
  tempMax: number | null
  /** True when the pH, temperature and clock times of the readings are generated samples, not plant data. */
  conditionIsSample: boolean
  note: string
  prep: Prep
  readings: Reading[]
}

/** Volt advice from the Au vs volt regression ("Arahan" in the sheet). */
export type Directive = 'insufficient' | 'raise' | 'lower' | 'hold'

export const DIRECTIVE_LABEL: Record<Directive, string> = {
  insufficient: 'Data belum cukup',
  raise: 'Naikkan volt',
  lower: 'Turunkan volt',
  hold: 'Volt sudah pas',
}

/** One GPC (gold potassium cyanide) addition to the gold bath. */
export type GpcEntry = {
  id: string
  date: string | null
  batchCode: string
  grams: number
  auFraction: number
}
