# Frontend conventions

The app follows the WIT house style (`wit-code-agent`): grey canvas, white cards without borders, one ink hero per page, one accent, pill controls, DM Sans.

## Reference pages

- Dashboard: `apps/admin/src/pages/dashboard/DashboardPage.tsx`
- List: `apps/admin/src/pages/batches/BatchesPage.tsx` (stat tiles as filters, chips, table on the canvas, filters in the URL)
- Detail: `apps/admin/src/pages/batches/BatchDetailPage.tsx` (action bar with the one next step, ink hero, stage tabs in `?tab=`, one `pending` state for every dialog) with `PrepTab`, `LogTab` and `ResultTab`
- Master data: `apps/admin/src/pages/models/ModelsPage.tsx`

## Rules

- Pages compose; formulas live in `packages/fixtures` (`engine.ts`, `prep.ts`). A page never computes a spreadsheet column itself.
- Every guarded action has a blocker function in `store.ts`. The reducer refuses with it and the UI shows the same sentence.
- Every mutation ends in a toast. Forms show errors after the first submit.
- Numbers go through `fmtNumber`, `fmtPercent`, `fmtHours` and `fmtDate` (Indonesian format). Inputs accept a comma or a dot (`lib/form.ts`).
- Percent fields are typed as percentages and stored as fractions (Au 72,01 % is stored as 0.7201) on batches. Data sheets store `targetAuPct` as a percentage, as the workbook does.
- Check every screen at 375, 768 and 1440 wide: `main.scrollWidth` must equal `main.clientWidth`.
- UI copy is Bahasa Indonesia in the operator's words: "Siapkan, Catat, Hasil", "Tebal emas", "Saran volt", "Isi rak". Keep spreadsheet terms (AMM, GPC, CuCN) where operators use them, and explain them in the hint.
- Each screen has one primary button for the next step. A step that has to wait shows why next to it.
