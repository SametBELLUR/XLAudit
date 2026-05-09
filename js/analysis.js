// Sheet ve workbook seviyesinde tutarsızlık, sabit ve çapraz referans
// analizi. Patern gruplarından beslenir; ham formülleri yeniden
// tokenize etmez.

export const MAJORITY_THRESHOLD = 0.8;

// Patern grup map'inden hücre adresi → patern lookup'u üretir.
function buildCellToPattern(groups) {
  const m = new Map();
  for (const g of groups.values()) {
    for (const cell of g.cells) m.set(cell.addr, g.pattern);
  }
  return m;
}

// Sütun bazında patern dağılımını analiz eder.
// Dönüş: [{ col, colLetter, total, patterns, state, majority, outliers }]
//   state: 'tutarlı' | 'sapma' | 'karışık'
//   majority/outliers: { pattern, cells } şeklinde
export function findInconsistencies(formulas, groups) {
  const c2p = buildCellToPattern(groups);
  const byCol = new Map();
  for (const f of formulas) {
    if (!byCol.has(f.col)) byCol.set(f.col, []);
    byCol.get(f.col).push(f);
  }

  const results = [];
  for (const [col, cells] of byCol) {
    const counts = new Map();
    for (const cell of cells) {
      const p = c2p.get(cell.addr);
      if (!counts.has(p)) counts.set(p, []);
      counts.get(p).push(cell);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);
    const total = cells.length;

    let state, majority = null, outliers = [];
    if (sorted.length === 1) {
      state = 'tutarlı';
      majority = { pattern: sorted[0][0], cells: sorted[0][1] };
    } else if (sorted[0][1].length / total >= MAJORITY_THRESHOLD) {
      state = 'sapma';
      majority = { pattern: sorted[0][0], cells: sorted[0][1] };
      outliers = sorted.slice(1).map(([p, cs]) => ({ pattern: p, cells: cs }));
    } else {
      state = 'karışık';
      outliers = sorted.map(([p, cs]) => ({ pattern: p, cells: cs }));
    }

    results.push({
      col,
      colLetter: cells[0].colLetter,
      total,
      patternCount: sorted.length,
      state,
      majority,
      outliers,
    });
  }
  return results.sort((a, b) => a.col - b.col);
}

// Sheet seviyesinde sabit değerleri (NUMBER tokenları) toplar.
// Dönüş: [{ value, cellCount, patternCount, samplePatterns: [...] }]
export function aggregateConstants(groups) {
  const map = new Map();
  for (const g of groups.values()) {
    for (const c of g.numericConstants) {
      let entry = map.get(c);
      if (!entry) {
        entry = { value: c, cellCount: 0, patterns: new Set() };
        map.set(c, entry);
      }
      entry.cellCount += g.cells.length;
      entry.patterns.add(g.pattern);
    }
  }
  return [...map.values()]
    .map((e) => ({
      value: e.value,
      cellCount: e.cellCount,
      patternCount: e.patterns.size,
      samplePatterns: [...e.patterns].slice(0, 3),
    }))
    .sort((a, b) => b.cellCount - a.cellCount);
}

// External link'leri (formüldeki [file.xlsx] paterni) toplar.
// Workbook seviyesinde aggregate edilebilir (tüm sheet'lerin gruplarını
// concat ederek). Dönüş: [{ target, cellCount, patternCount,
// samplePatterns, sheetsContainingIt }]
export function aggregateExternalLinks(sheets) {
  const map = new Map();
  for (const s of sheets) {
    const groups = s.patternGroups;
    if (!groups) continue;
    for (const g of groups.values()) {
      for (const ext of g.extRefs) {
        let entry = map.get(ext);
        if (!entry) {
          entry = {
            target: ext,
            cellCount: 0,
            patterns: new Set(),
            sheets: new Set(),
          };
          map.set(ext, entry);
        }
        entry.cellCount += g.cells.length;
        entry.patterns.add(g.pattern);
        entry.sheets.add(s.name);
      }
    }
  }
  return [...map.values()]
    .map((e) => ({
      target: e.target.replace(/^\[/, '').replace(/\]$/, ''),
      cellCount: e.cellCount,
      patternCount: e.patterns.size,
      samplePatterns: [...e.patterns].slice(0, 3),
      sheets: [...e.sheets],
    }))
    .sort((a, b) => b.cellCount - a.cellCount);
}

// Sheet'ler arası referansları toplar.
// Dönüş: [{ targetSheet, cellCount, patternCount, samplePatterns: [...] }]
export function aggregateCrossSheetRefs(groups) {
  const map = new Map();
  for (const g of groups.values()) {
    for (const ref of g.sheetRefs) {
      let entry = map.get(ref);
      if (!entry) {
        entry = { ref, cellCount: 0, patterns: new Set() };
        map.set(ref, entry);
      }
      entry.cellCount += g.cells.length;
      entry.patterns.add(g.pattern);
    }
  }
  return [...map.values()]
    .map((e) => ({
      targetSheet: e.ref.replace(/!$/, ''),
      cellCount: e.cellCount,
      patternCount: e.patterns.size,
      samplePatterns: [...e.patterns].slice(0, 3),
    }))
    .sort((a, b) => b.cellCount - a.cellCount);
}

// Sadece bir kez geçen patern gruplarını ayırır (ad-hoc / tek seferlik
// formüller). Tutarsızlık raporunda zaten görünenler hariç bırakılır.
export function findOneOffFormulas(groups, inconsistencyOutlierAddrs) {
  const out = [];
  for (const g of groups.values()) {
    if (g.cells.length !== 1) continue;
    const cell = g.cells[0];
    if (inconsistencyOutlierAddrs.has(cell.addr)) continue;
    out.push({
      addr: cell.addr,
      pattern: g.pattern,
      value: cell.v,
      redacted: !!cell.redacted,
    });
  }
  return out.sort((a, b) => a.addr.localeCompare(b.addr));
}

// Tutarsızlık sonuçlarından sapan hücre adresleri seti.
// Karışık sütunlarda tüm hücreler outlier olarak sayılır
// (findInconsistencies bu durumda majority=null bırakır, tüm
// patternleri outliers'a koyar).
export function collectInconsistencyOutlierAddrs(inconsistencies) {
  const set = new Set();
  for (const inc of inconsistencies) {
    if (inc.state === 'tutarlı') continue;
    for (const o of inc.outliers) for (const cell of o.cells) set.add(cell.addr);
  }
  return set;
}
