<!--
SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
Copyright (c) 2026 Samet Bellur
-->

[🇹🇷 Türkçe](PROMPT.md) · **🇬🇧 English**

---

# Excel Audit Report — LLM Prompt Template

The Markdown report below was produced automatically by the **Excel Audit Report Generator**. Looking at this report, I want you to produce a two-part analysis.

## Structural notes (about the report format)

- **"Templates (Workbook-wide)"** table: the heart of the workbook's actual business rules. Each row is one formula "skeleton" (numeric constants abstracted as `{const}`). The "Sheet+Ranges" column shows which sheets and which cell ranges that template applies to. The "Constant Distribution" column gives the positional numeric constants and their frequency; a ⚠ marker indicates the presence of a minority (outlier) constant.
- The `{row}` placeholder in patterns: the row number of the cell containing the formula. `{row+N}` and `{row-N}` denote relative offsets.
- The `{const}` placeholder: a numeric constant (VAT rate, multiplier, fixed threshold, etc.).
- The "Constants", "Cross-sheet References", and "One-off Formulas" tables under each sheet are sheet-level details.
- The "Named Ranges" table lists workbook-wide logical names (parameter tables, constants).

## What I want from you

### Section 1 — General Business Rules

Analyze the report holistically and write a **brief executive summary** under the following headings (200-400 words total):

1. **Workbook's overall purpose.** What is this file likely used for? (e.g. "12-month VAT declaration", "customer billing", "budget consolidation", "inventory valuation"). Infer from sheet names, the dominant formula structures in the "Templates" table, and the named ranges.
2. **Dominant business rules.** Take the top 3-5 templates with the most cells from the Templates table, and explain each in plain language:
   - Read the skeleton (`=B{row}*{const}` → "multiplies the value in column B by a fixed rate")
   - Look at the values in "Constant Distribution" and infer their business meaning (1.18 → VAT, 1.20 → updated VAT rate, 0.95 → discount, 12 → number of months, 365 → days in year, etc.)
   - State which sheets/ranges they apply to
3. **Workbook flow.** Which sheet depends on which other sheet's outputs? Classify the workbook into "input sheets", "intermediate calculation sheets", and "summary/output sheets" (look at Cross-sheet References).
4. **Constants and named ranges.** The business context of hardcoded numbers and named ranges.
5. **Notable anomalies.**
   - Rows in the Templates table where "Constant Distribution" has the ⚠ marker — outlier constants (e.g. a mistakenly entered VAT rate)
   - Risky formulas in "One-off Formulas" sections (e.g. manually entered totals, hardcoded values)
   - If External Links are present: external file dependency risks

### Section 2 — Sheet-by-Sheet Analysis

Open a separate subsection for each visible sheet (you can also see hidden sheets in the "Hidden Items" table; mention them if relevant):

#### {Sheet Name}

- **Purpose:** What does this sheet do? Business meaning in 1-2 sentences.
- **Key fields / columns:** Which columns or cell blocks are critical? For each:
  - Which template it uses (take from the Templates table, e.g. `=B{row}*{const}`)
  - Business meaning: "Column C calculates VAT-included amount (B × 1.18)"
  - Which sheets or named ranges it pulls data from
- **Anomalies / points of attention:**
  - Outlier constants (those marked with ⚠)
  - Manual interventions appearing in one-off formulas
  - Hardcoded values (raw numbers used instead of named ranges)
- **Improvement suggestion (if any, brief):** A structural issue, simplification, or named range suggestion.

## Style rules

- Write in **English**, clear and non-technical; you are addressing a business user.
- **Do not repeat the raw tables.** Interpret and digest the data in the tables.
- **Translate skeletons/placeholders for the reader:** `=B{row}*1.18` → "value in column B × 1.18 (VAT rate)".
- If **masked values** (`***`) are present, keep them hidden, just note "customer info masked" and move on.
- **Avoid speculation:** make reasonable assumptions like "1.18 is likely the VAT rate"; but never invent numbers or business rules that aren't there.
- Where you are uncertain, add a note like "the report does not clarify this — confirm with the user".

---
