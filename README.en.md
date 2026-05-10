[🇹🇷 Türkçe](README.md) · **🇬🇧 English**

---

# Excel Audit Report Generator

Processes `.xlsx` and `.xlsm` files in the browser to produce a structured Markdown report for LLM-based audit. **No file ever leaves your browser.**

## Running

Open `index.html` directly in your browser — double-click works (`file://` is supported, no build step or local server required).

It also runs from GitHub Pages or `python -m http.server 8000`; the only network dependency is fetching SheetJS from CDN.

### Standalone single-file build

For shared network drives that block `.js` files (e.g. FSRM "Executable Files" rule): a **single-file (CSS+JS inlined)** version is produced on demand. Open the app normally, then click **"⬇ Download standalone (single-file) version"** at the bottom of the page — a fresh bundle is built from the current source and downloaded as `index.html`.

The downloaded file is self-contained, no folder structure required. The repo does not keep a pre-built bundle; it is always generated from the latest code, so there is no sync drift.

## Usage

1. Drag your `.xlsx` or `.xlsm` file onto the dropzone (or use "select file").
2. Click **Analyze**.
3. **Sensitive data triage:** every unique value that would appear in the report is shown in a 3-tab grid (Text / Integer / Decimal); pick the ones you want masked one-by-one or via "Select All" → **Done**.
4. Get the report via **Copy to Clipboard** or **Download Report** (`.md` or `.txt` selectable), then paste into your LLM.
5. To get a focused subset for a single sheet plus the sheets it cross-references: in the result toolbar, pick a sheet from the **Subset** selector and click **Download sheet+linked**.

### LLM Prompt Template

If you're not sure what to ask your LLM, a ready-made prompt template is provided: [`PROMPT.en.md`](PROMPT.en.md) (English) / [`PROMPT.md`](PROMPT.md) (Turkish). It instructs the LLM to produce a two-part analysis:
1. **General business rules** — workbook purpose, dominant templates, cross-sheet flow, anomalies
2. **Sheet-by-sheet analysis** — for each sheet: purpose, key formulas, points of attention

Copy the contents of `PROMPT.en.md`, append the report you generated, and send to your LLM.

### For the curious: how it works

A short, non-technical walkthrough of what's happening under the hood (why your file never leaves the browser, what "skeleton" means, how a misplaced VAT rate becomes obvious at a glance): [**`HOW_IT_WORKS.en.md`**](HOW_IT_WORKS.en.md).

## Dependencies

`index.html` pulls a single file from CDN:

- [SheetJS](https://sheetjs.com/) `xlsx@0.20.3` (Excel parsing + CFB)

If the primary CDN is unreachable, the loader falls back to `cdn.jsdelivr.net`.

## Architecture

Single page, vanilla JS. No build step, no npm. Modules are loaded via classic `<script>` tags in dependency order; each module attaches to a `window.EA.<module>` namespace (IIFE) so it works over `file://` (double-click open).

```
.
├── LICENSE          # PolyForm Noncommercial 1.0.0
├── README.md        # Turkish (default)
├── README.en.md     # English
├── PROMPT.md        # LLM analysis prompt template (Turkish)
├── PROMPT.en.md     # LLM analysis prompt template (English)
├── HOW_IT_WORKS.md     # Plain-language walkthrough (Turkish)
├── HOW_IT_WORKS.en.md  # Plain-language walkthrough (English)
├── index.html       # HTML shell, CDN script, module load order
├── css/styles.css   # Plain CSS (system font, max-width 900px)
└── js/
    ├── parse.js     # SheetJS workbook + sheet metadata + formula collection
    ├── patterns.js  # Tokenizer + skeleton patternize + groupByPattern + compactRanges
    ├── analysis.js  # Constants + cross-sheet refs + workbook-level template aggregation
    ├── triage.js    # Sensitive data triage modal (tabbed grid)
    ├── markdown.js  # Markdown report assembly (full + subset)
    └── main.js      # DOM events + pipeline + standalone bundle download
```

## Changelog

- **M1 — Skeleton + file upload:** Drag-drop, SheetJS load, sheet listing.
- **M2 — Flat formula list:** Per-sheet `Cell | Formula | Type | Value` table, async yield to keep UI responsive.
- **M3 — Pattern engine:** Single-pass regex tokenizer, anchor-based pattern generation, column-based range compaction (`C2:C100`).
- **M4 — Constants + cross-sheet:** Hardcoded numeric constant and cross-sheet reference tables, one-off formula list.
- **M5 — Named ranges, external links, hidden sheets:** Workbook-level metadata aggregation and overall report shape.
- **Sensitive data triage:** Tabbed (Text/Integer/Decimal) grid + filter + bulk selection; marked values appear as `***` in the report.
- **Sheet subset:** Focused, shorter Markdown for a selected sheet plus the sheets it directly references.
- **Standalone bundle button:** Live CSS+JS inline single-file `index.html` generated from source; no generated file kept in the repo.
- **PolyForm Noncommercial 1.0.0 license:** Commercial use prohibited; SPDX headers on all source files.
- **Semantic compression:** All numeric constants are abstracted to `{const}` in skeletons; formulas sharing the same skeleton across sheets are merged into a single workbook-level "Templates" table; constant distribution and outlier cell detection are automatic. Per-column inconsistency analysis was removed (the Templates table delivers a sharper signal).
- **Download format:** `.md` (default) or `.txt` selectable from a small selectbox.
- **Prompt template:** [`PROMPT.md`](PROMPT.md) — ready-made two-part (general business rules + sheet-by-sheet) template to make the LLM interpret the report.
- M6 (later): VBA macro extraction (MS-OVBA decompression).
