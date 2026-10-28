# Electroforming console

A frontend for the Bak 1 / Bak 2 electroforming trial. It replaces two Excel workbooks:

- `Program EF Bak 1 Utk Trial Scada.xlsx`: the batch log. One sheet per batch records time, volt, ampere, AMM meter, X-ray Au and plate thickness, then derives deposit microns, rate, cathode efficiency and the volt advice (naikkan, turunkan, tahan).
- `Luas AREA Bak1 Utk Trial Scada.xlsx`: the model surface-area master and the preparation of each batch: rack load, deposit and chemical needs, theoretical AMM, bath chemistry with top-ups, pre-treatment and the GPC log.

No backend. State lives in the browser (`localStorage`, key `ef.admin.state.v1`), seeded from both workbooks. "Kembalikan data awal" in the header menu reloads the seed.

## How a batch flows

Every batch has one page with three stages:

1. **Siapkan**: create the batch (code, bath, date, targets), fill the rack from the model list, enter the lab results. Surface area and theoretical AMM follow the rack. A batch can be prepared while another batch still runs in the same bath.
2. **Catat**: "Mulai proses" asks for the starting Au and plate thickness. The operator logs the bath every one to two hours: clock time, pH, temperature, volt, ampere and the AMM meter, plus X-ray and plate thickness when measured. The form starts at the current time, computes the interval from the previous log and offers the suggested volt. A "Kondisi bak" card shows the latest pH, volt, temperature and log time, and marks the bath "Waktunya catat" after one hour and "Terlambat" after two. Each batch has pH and temperature limits; the defaults (pH 9.5–10.5, 60–65 °C) are samples until the plant sets its standard. The Excel rows had no pH, temperature or clock time, so the seed fills them with generated values and the screens label those batches "Data contoh". Running sample batches are shifted so their last log sits 40 minutes before the app loads. The log opens per jam: one row per clock hour of the run, with the hours nobody logged and "Terlambat" once two hours pass without a log. An hour opens to its readings and a reading opens to every computed column; "Semua pembacaan" shows the flat list (`hourlyLog` in `engine.ts`).
3. **Hasil**: after "Selesaikan", the operator fills the final weighings and the product assay.

The home page shows each bath with its one next action.

**Monitor 3D** (`/monitor`) draws the electroforming room with Three.js (`apps/admin/src/pages/monitor/scene.ts`): one tank per bath in the system, the PC rekap desk and the X-ray. Each tank shows the running batch: volt and temperature on its LED readouts, a lamp that turns amber when the batch needs a look, a turning rack and gold pieces that grow with the deposit. Clicking a tank, the PC or the X-ray flies the camera there and opens a side panel built from the app's own components. Colours come from the theme tokens, and Three.js loads only with this page. The side panel of a tank shows the batch in detail (trends of thickness, pH, temperature and volt, and the rack load with model photos) and records a reading in place. Each saved reading plays the operator's round: walk to the bath, open the door, take an X-ray sample when the reading has a kadar, scan it, then log it at the PC while packets run from the bath to the PC. Between readings the operator patrols. The Animasi switch turns the motion off; it starts off when the system asks for reduced motion. The batch page links back with "Lihat di Monitor 3D". Baths are editable data ("Tambah bak" on Monitor 3D, rename or delete from a bath's menu; a bath in use by a batch cannot be deleted). Every page reads the same list, and the 3D row follows it: a new tank rises from the floor, the others slide into place, and the room, fog, shadows and overview camera widen with the row.

**Laporan** (`/reports`) holds the ten reports of the SCADA reporting catalog (R01 to R10). All of them share one filter bar: date range with a chosen basis (batch start, batch end or measurement time), bath, batch, product model, status and the chart grouping. Each report adds its own range and choice filters. Filters live in the URL, so a filtered report can be shared as a link. The detail tables export to CSV (with the filters written at the top) and the page prints to PDF. Every column carries its source: target, process measurement, lab/QC or formula estimate. Fields the plant does not record yet (shift, operator, QC result, final weighing, CuCN and KCN additions) stay empty and are listed on the report; the reports never fill them with estimates. Each report opens with an "Apa kata data" card: findings computed from the rows on screen, so they follow every filter (`packages/fixtures/src/report-insights.ts`). The row builders are in `packages/fixtures/src/reports.ts`, tested in `test/reports.test.ts`.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:5373
pnpm test       # engine and store tests against the Excel results
pnpm typecheck
pnpm build
```

## Layout

| Path | What it holds |
|---|---|
| `packages/types` | Domain types: `Batch` (with its `Prep` and `Reading`s), `Model`, `RackPart`, `GpcEntry` |
| `packages/fixtures/src/engine.ts` | Batch log formulas (program workbook) |
| `packages/fixtures/src/prep.ts` | Preparation formulas (area workbook) |
| `packages/fixtures/src/store.ts` | Reducer, blockers, seed loading |
| `packages/fixtures/data/*.json` | Seed extracted from the two workbooks |
| `packages/ui` | WIT component kit, copied from the CMMS repo |
| `apps/admin` | Vite + React 19 app; `public/models/` holds the model photos from the master sheet |

The tests in `packages/fixtures/test` compare the engine with the cached cell values of every sheet: all 7 batch logs and all 13 data sheets. The Cara hitung page lists each formula with its Excel cell and the places where the app differs from the workbook.
