<!--
SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
Copyright (c) 2026 Samet Bellur
-->

[🇹🇷 Türkçe](HOW_IT_WORKS.md) · **🇬🇧 English**

---

# How does this tool work?

A short, non-technical walkthrough. Why your Excel file never leaves the browser, what "skeleton" means, how a single misplaced VAT rate becomes obvious at a glance — all of it.

## 1. No server, ever

Your Excel file does **not leave your browser**. JavaScript code (the SheetJS library) opens the file inside the browser itself, reading it cell by cell. The entire analysis runs on your CPU; once the report is generated, you copy it and send it to your LLM yourself.

## 2. How it reads the spreadsheet

An `.xlsx` file is essentially a ZIP archive — its inner XMLs hold every sheet, every cell, and every formula. SheetJS parses these and gives us:

- **Cell address** (`B2`, `D5`, etc.)
- **Formula** (if any, like `=A1*1.18`)
- **Computed value** (the last result Excel saved, e.g. `118`)
- **Sheet metadata** (name, hidden flag, used range)

We then care only about cells **with formulas** — empty cells and plain values (customer names, etc.) do not appear in the report.

## 3. Skeleton (formula fingerprint) — the key idea

Imagine column C holds VAT calculations:

```
C2:   =B2*1.18
C3:   =B3*1.18
C4:   =B4*1.18
...
C100: =B100*1.18
```

You see 99 different formulas, but they all do the **same thing**: "multiply the value in column B for the same row by 1.18". Pasting these raw to an LLM is wasteful and hard to reason about.

What we do: **generalize each formula in two steps**.

**Step A — replace row numbers with `{row}`:**

```
=B2*1.18  → =B{row}*1.18
=B3*1.18  → =B{row}*1.18
=B4*1.18  → =B{row}*1.18
```

They're all the same now! Because each cell refers to its own row.

**Step B — replace numeric constants with `{const}`:**

```
=B{row}*1.18  → =B{row}*{const}
```

We call this a **skeleton**. The "varying parts" of the original formula (row number, fixed numbers) are erased; only the "shape" remains. It's the formula's **fingerprint**.

The beautiful part: 99 different formulas now collapse under **a single skeleton**. One line in the report instead of 99.

## 4. Templates table — workbook-wide

We merge skeletons not just within one sheet, but across the **entire workbook**. In a 12-month file where Jan/Feb/Mar sheets share the same formulas:

```
| Skeleton          | Sheet+Ranges                          | Cells | Constant Dist. |
| =B{row}*{const}   | Jan: C2:C100; Feb: C2:C100; ...       | 1200  | 1.18 (1199),   |
|                   | Dec: C2:C100                          |       | 1.20 (1) ⚠     |
```

In one row you see:

- This template applies the same way across all 12 months
- It covers 1200 cells
- 1199 of them use VAT 1.18, but **one cell uses 1.20** — likely a misentered VAT (⚠ outlier)

When you give the LLM that single row, it picks up both the structure and the anomaly at once.

## 5. Constant distribution = anomaly intuition

The `{const}` placeholder inside a skeleton keeps a **histogram** — which number was used in how many cells?

- All the same number → consistent
- 80%+ identical, a small minority differs → **deviation** (likely a mistake)
- All over the place → **mixed** (could be intentional variety, deserves audit)

This automatically catches a manual VAT-rate edit, an inconsistent discount, or a forgotten constant.

## 6. Other aggregations

Same logic applies to:

- **Cross-sheet references:** "30 cells in this sheet point to `Stock!`" — a dependency map
- **Named ranges:** user-defined names like `VAT_RATE`
- **External links:** formulas that reference other workbooks (breakage risk)
- **Hidden sheets:** invisible-to-the-user but potentially important areas

All packaged into a single Markdown report.

## 7. Sensitive data triage

If your Excel contains things like customer names or ID numbers, a formula's **computed value** (e.g. "Galataport") may show up in the report. So before producing the report, a popup appears:

- 3 tabs: **Text / Integer / Decimal**
- Every unique value is a row
- You can mark "Sensitive?"

Marked values are masked as `***` in the report; the formula structure (skeleton) stays visible — so the LLM sees "what it does" but never sees "which customer".

## 8. Subset download

If your workbook has 30 sheets, instead of feeding the whole report to the LLM, you can pick one sheet and download its "this sheet + the sheets it references" subset. The LLM stays focused on a single task.

## Summary — the flow at a glance

```
.xlsx → SheetJS parse → reduce each formula to a skeleton → merge across the workbook
     → constant histogram + anomaly detection → triage → Markdown report → you send to your LLM
```

**"Skeleton"** = the abstract shape of your formula; the parts that vary (row number, numeric constant) are placeholders `{row}` and `{const}`. A thousand formulas with the same shape collapse into one row. **Lower LLM token bill, anomalies brought to the surface.**
