import type { Grain } from '@ef/fixtures'

export type ReportCode = 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07' | 'R08' | 'R09' | 'R10'

export type ReportMeta = {
  code: ReportCode
  title: string
  purpose: string
  priority: 'p1' | 'p1-material' | 'p2' | 'p3'
  /** Grouping choices for the trend charts; the first one is the default. */
  grains: Grain[]
  /** Fields the plant does not record yet, shown so nobody mistakes an empty column for zero. */
  missing: string[]
}

const BATCH_GRAINS: Grain[] = ['batch', 'day', 'week', 'month']
const READING_GRAINS: Grain[] = ['reading', 'batch', 'day', 'week', 'month']

export const REPORTS: ReportMeta[] = [
  {
    code: 'R01',
    title: 'Produksi per batch',
    purpose: 'Identitas batch, jumlah barang, luas, berat dan hasil proses.',
    priority: 'p1',
    grains: BATCH_GRAINS,
    missing: ['status QC', 'berat akhir timbangan'],
  },
  {
    code: 'R02',
    title: 'Listrik dan proses',
    purpose: 'Volt dan ampere sepanjang proses, terhadap saran dan set target.',
    priority: 'p1',
    grains: READING_GRAINS,
    missing: ['periode alarm dari PLC'],
  },
  {
    code: 'R03',
    title: 'Ketebalan',
    purpose: 'Pencapaian tebal terhadap target, dari perkiraan, ukur proses dan QC.',
    priority: 'p1',
    grains: BATCH_GRAINS,
    missing: ['titik sampel QC'],
  },
  {
    code: 'R04',
    title: 'Rapat arus dan AMM',
    purpose: 'Arus per luas aktif dan akumulasi ampere-menit terhadap teori.',
    priority: 'p1',
    grains: READING_GRAINS,
    missing: [],
  },
  {
    code: 'R05',
    title: 'Kadar emas dan tembaga',
    purpose: 'Kadar Au dan Cu dari X-ray, lab dan persamaan, terhadap target.',
    priority: 'p1-material',
    grains: READING_GRAINS,
    missing: ['hasil QC per sampel'],
  },
  {
    code: 'R06',
    title: 'Pemakaian bahan kimia',
    purpose: 'Kebutuhan, penambahan dan hasil uji larutan per batch.',
    priority: 'p1-material',
    grains: BATCH_GRAINS,
    missing: ['penambahan CuCN, KCN dan replenisher', 'petugas pencatat'],
  },
  {
    code: 'R07',
    title: 'Neraca emas',
    purpose: 'Emas masuk, menempel di produk, tersisa di bak, dan selisihnya.',
    priority: 'p1-material',
    grains: BATCH_GRAINS,
    missing: ['emas pada kawat dan sampel', 'timbangan akhir produk'],
  },
  {
    code: 'R08',
    title: 'Efisiensi proses',
    purpose: 'Hasil aktual terhadap perhitungan teori: AMM, deposit dan laju.',
    priority: 'p2',
    grains: BATCH_GRAINS,
    missing: [],
  },
  {
    code: 'R09',
    title: 'Perbandingan batch dan mutu',
    purpose: 'Batch berdampingan untuk melihat yang konsisten dan yang menyimpang.',
    priority: 'p2',
    grains: BATCH_GRAINS,
    missing: ['hasil QC lolos atau gagal'],
  },
  {
    code: 'R10',
    title: 'Akurasi perkiraan dan saran',
    purpose: 'Perkiraan rumus terhadap hasil nyata, dan riwayat saran volt.',
    priority: 'p3',
    grains: BATCH_GRAINS,
    missing: [],
  },
]

export const PRIORITY_LABEL: Record<ReportMeta['priority'], { title: string; note: string }> = {
  p1: { title: 'Dasar trial', note: 'Bisa dipakai sekarang dari catatan pembacaan.' },
  'p1-material': {
    title: 'Mutu dan material',
    note: 'Lengkap setelah hasil lab dan penambahan bahan dicatat.',
  },
  p2: { title: 'Histori dan analisis', note: 'Makin berguna seiring bertambahnya batch selesai.' },
  p3: { title: 'Setelah rumus tervalidasi', note: 'Membandingkan perkiraan rumus dengan hasil nyata.' },
}

export const GRAIN_LABEL: Record<Grain, string> = {
  reading: 'Per pembacaan',
  batch: 'Per batch',
  day: 'Per hari',
  week: 'Per minggu',
  month: 'Per bulan',
}

export const reportByCode = (code: string | undefined) =>
  REPORTS.find((r) => r.code.toLowerCase() === code?.toLowerCase())
