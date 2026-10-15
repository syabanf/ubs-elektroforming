import { Banner, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@ef/ui'

type Formula = { column: string; name: string; formula: string }

const SECTIONS: { title: string; note: string; items: Formula[] }[] = [
  {
    title: 'Pencatatan: arus dan meter',
    note: 'Per pembacaan. AMM real adalah angka kumulatif dari meter.',
    items: [
      {
        column: 'D',
        name: 'Lama interval',
        formula: 'Jam catat − jam catat sebelumnya (bisa diketik sendiri)',
      },
      {
        column: 'Baru',
        name: 'Pengingat catat',
        formula: '1 jam sejak jam catat terakhir: waktunya catat · lewat 2 jam: terlambat',
      },
      { column: 'G', name: 'Real A/dm²', formula: 'Ampere ÷ luas permukaan' },
      { column: 'I', name: 'Target ampere', formula: 'Set target A/dm² × luas permukaan' },
      { column: 'L', name: 'AMM', formula: 'Ampere × waktu (menit)' },
      { column: 'N', name: 'Selisih AMM', formula: 'AMM real − AMM real pembacaan sebelumnya' },
      { column: 'R8', name: 'Perkiraan set ampere awal', formula: 'Luas permukaan × 0,3' },
    ],
  },
  {
    title: 'Pencatatan: kadar dan berat',
    note: 'Kadar Au dari X-ray, Cu adalah sisanya.',
    items: [
      { column: 'P', name: 'Cu', formula: '1 − Au' },
      { column: 'Q', name: 'Persamaan elektrokimia', formula: '1 ÷ (Au ÷ 122,616 + Cu ÷ 39,48)' },
      { column: 'R', name: 'Perkiraan berat (g)', formula: 'Persamaan elektrokimia × AMM ÷ 1000' },
      { column: 'Q43', name: 'Persamaan rata-rata', formula: 'Total berat ÷ total AMM × 1000' },
      { column: 'O43', name: 'Au rata-rata', formula: '1,4749 − 58,228 ÷ persamaan rata-rata' },
    ],
  },
  {
    title: 'Pencatatan: tebal emas',
    note: 'Tebal plat diukur dua sisi, jadi selisihnya dibagi dua.',
    items: [
      { column: 'T', name: 'Deposit (µm)', formula: '(tebal plat − plat awal) ÷ 2 × 1000' },
      {
        column: 'U',
        name: 'µm per AMM selisih',
        formula: '(deposit − deposit sebelumnya) ÷ (AMM real − AMM real sebelumnya)',
      },
      { column: 'W6', name: 'Target µm per AMM', formula: 'Target mikron ÷ teori AMM' },
      { column: 'V', name: 'Target µm', formula: 'Target µm per AMM × AMM real' },
      { column: 'W', name: '% real vs teori', formula: 'Deposit ÷ target µm × 100' },
      { column: 'X', name: 'µm per total AMM', formula: 'Deposit ÷ jumlah AMM sampai baris ini' },
      { column: 'Y', name: 'µm per jam', formula: 'Deposit ÷ (jumlah menit sampai baris ini ÷ 60)' },
      { column: 'R10', name: 'Efisiensi katoda', formula: 'Teori AMM ÷ AMM real terakhir × 100' },
      {
        column: 'T44',
        name: 'Estimasi sisa jam',
        formula: '(target − deposit terakhir) ÷ (deposit terakhir ÷ jam sampai deposit terakhir)',
      },
    ],
  },
  {
    title: 'Saran volt',
    note: 'Regresi linear kadar Au terhadap volt dari pembacaan sebelumnya.',
    items: [
      { column: 'AA', name: 'n data', formula: 'Jumlah pembacaan sebelumnya yang punya Au dan volt' },
      {
        column: 'AB–AD',
        name: 'Slope, intersep, R²',
        formula: 'SLOPE, INTERCEPT dan RSQ dari Au (y) terhadap volt (x)',
      },
      { column: 'AE', name: 'Saran volt', formula: '(target tengah − intersep) ÷ slope' },
      { column: 'AF', name: 'Delta volt', formula: 'Saran volt − volt yang dipakai' },
      {
        column: 'AG',
        name: 'Arahan',
        formula:
          'n < 5: data belum cukup · delta > 0,005: naikkan · delta < −0,005: turunkan · lainnya: tahan',
      },
    ],
  },
  {
    title: 'Persiapan: luas dan bahan',
    note: 'Lembar "Batch nn" di file Luas AREA. Luas per buah dari Daftar model.',
    items: [
      { column: 'G22', name: 'Luas total (dm²)', formula: 'Σ jumlah × luas per unit (model, plat, kawat)' },
      { column: 'G24', name: 'Ampere awal teori', formula: 'Luas total × 0,3' },
      { column: 'D25', name: 'Volume deposit (cm³)', formula: 'Luas (cm²) × target mikron ÷ 10.000' },
      { column: 'P26', name: 'Densitas alloy', formula: '1 ÷ (Au ÷ 19,32 + Cu ÷ 8,96)' },
      { column: 'D27', name: 'Berat deposit (g)', formula: 'Volume deposit × densitas alloy' },
      { column: 'D29', name: 'GPC (g)', formula: 'Berat deposit × kadar Au ÷ 0,683' },
      { column: 'D31', name: 'CuCN (g)', formula: 'Berat deposit × kadar Cu ÷ 0,71' },
      { column: 'D33', name: 'Replenisher (mL)', formula: '1,5 × berat deposit' },
      {
        column: 'D45',
        name: 'AMM teori',
        formula: '(Au ÷ 196,97 + Cu ÷ 63,54) × 96.485 ÷ 60 × (200 − efisiensi) ÷ 100',
      },
      { column: 'E45', name: 'Efisiensi katoda', formula: 'AMM teori ÷ total AMM real × 100' },
      { column: 'G', name: 'Berat timah model', formula: 'Rata-rata timbangan − 0,068 g' },
    ],
  },
  {
    title: 'Persiapan: larutan dan pre-treatment',
    note: 'Hasil lab dalam g/L dikali volume larutan.',
    items: [
      { column: 'I34', name: 'Target Au (g/L)', formula: '10 + Au deposit ÷ volume' },
      { column: 'I35', name: 'Target Cu (g/L)', formula: '45 + Cu deposit ÷ volume' },
      {
        column: 'G35',
        name: 'Penambahan Au (g)',
        formula: 'Bila Au awal < target: (target − awal) × volume',
      },
      { column: 'I39', name: 'GPC ditambah (g)', formula: 'Penambahan Au ÷ 0,683' },
      { column: 'I40', name: 'CuCN ditambah (g)', formula: 'Penambahan Cu ÷ 0,71, butuh KCN 1,45 × CuCN' },
      { column: 'M28', name: 'Au terpakai (g)', formula: 'Au awal + penambahan − Au akhir' },
      {
        column: 'K72',
        name: 'Penambahan pre-treatment',
        formula: 'Bila hasil < optimal: (optimal − hasil) × 200 L; H₂SO₄ dibagi 1,84 jadi mL',
      },
      { column: 'F', name: 'Au masuk dari GPC', formula: 'GPC × 0,683' },
    ],
  },
]

export function FormulasPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Cara hitung"
        description="Setiap angka di aplikasi dihitung dengan rumus yang sama seperti file Excel “Program EF” dan “Luas AREA”. Kode di kiri menunjuk ke sel Excel-nya."
      />
      <Banner tone="info" title="Perbedaan dengan Excel">
        <ul className="mt-1 space-y-1 pl-4 list-disc">
          <li>
            Arahan untuk interval berikut memakai semua pembacaan dan dibandingkan dengan volt terakhir. Di
            Excel, baris setelah data terakhir membandingkan dengan sel kosong, atau dengan{' '}
            <span className="font-mono">#REF!</span> di baris bawah.
          </li>
          <li>
            n data hanya menghitung pembacaan yang terisi. Excel ikut menghitung baris kosong sehingga n bisa
            lebih besar dari jumlah data.
          </li>
          <li>Pembacaan tanpa AMM real atau tebal plat dilewati, tanpa memunculkan #VALUE! atau #DIV/0!.</li>
          <li>
            Lembar batch 54 dan sesudahnya memakai acuan 71,5 % sampai 72,5 % dengan target tengah 71,3 %, di
            luar rentang. Nilai itu dipertahankan untuk batch impor.
          </li>
          <li>
            Luas CH4151 (12) di Excel dibagi 1000, model lain dibagi 10.000, jadi luasnya 10× lebih besar.
            Daftar model menandainya “Cek luas”.
          </li>
          <li>
            Berat KCN akhir di Excel memakai × 5, bukan × volume larutan. Aplikasi memakai volume larutan.
          </li>
          <li>
            Penambahan KCN memakai kekurangan untuk CuCN plus penambahan sampai target. Rumus Excel bisa
            menghasilkan nol atau negatif saat hanya satu dari keduanya terisi.
          </li>
          <li>Densitas aktual memakai mikron ÷ 10.000 untuk cm. Excel membagi 1000.</li>
          <li>
            Excel tidak mencatat pH, suhu dan jam catat. Batch lama diberi nilai contoh (berlabel “Data
            contoh”), dan batas aman pH 9,5–10,5 serta suhu 60–65 °C juga contoh. Ganti di Pengaturan batch
            setelah ada standar bak.
          </li>
          <li>Baris 25 master tanpa kode model (luas 0,05276 dm², sama dengan AT5682) tidak diimpor.</li>
        </ul>
      </Banner>
      <div className="gap-4 xl:grid-cols-2 grid grid-cols-1">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <p className="mt-0.5 text-xs text-muted">{section.note}</p>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                {section.items.map((f) => (
                  <div
                    key={f.column}
                    className="gap-3 rounded-2xl p-3 grid grid-cols-[3.5rem_minmax(0,1fr)] bg-surface-2"
                  >
                    <dt className="text-xs font-semibold font-mono text-muted">{f.column}</dt>
                    <dd className="min-w-0">
                      <p className="text-sm font-semibold">{f.name}</p>
                      <p className="mt-0.5 text-sm text-body">{f.formula}</p>
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
