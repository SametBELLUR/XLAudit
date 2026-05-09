// Sheet ve workbook seviyesinde tutarsızlık, sabit ve çapraz referans
// analizi. Patern gruplarından beslenir; ham formülleri yeniden
// tokenize etmez. IIFE + global namespace (window.EA.analysis).

window.EA = window.EA || {};
window.EA.analysis = (function () {
  const MAJORITY_THRESHOLD = 0.8;

  function buildCellToPattern(groups) {
    const m = new Map();
    for (const g of groups.values()) {
      for (const cell of g.cells) m.set(cell.addr, g.pattern);
    }
    return m;
  }

  function findInconsistencies(formulas, groups) {
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

  function aggregateConstants(groups) {
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

  function aggregateExternalLinks(sheets) {
    const map = new Map();
    for (const s of sheets) {
      const groups = s.patternGroups;
      if (!groups) continue;
      for (const g of groups.values()) {
        for (const ext of g.extRefs) {
          let entry = map.get(ext);
          if (!entry) {
            entry = { target: ext, cellCount: 0, patterns: new Set(), sheets: new Set() };
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

  function aggregateCrossSheetRefs(groups) {
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

  function findOneOffFormulas(groups, inconsistencyOutlierAddrs) {
    const out = [];
    for (const g of groups.values()) {
      if (g.cells.length !== 1) continue;
      const cell = g.cells[0];
      if (inconsistencyOutlierAddrs.has(cell.addr)) continue;
      out.push({ addr: cell.addr, pattern: g.pattern, value: cell.v });
    }
    return out.sort((a, b) => a.addr.localeCompare(b.addr));
  }

  function collectInconsistencyOutlierAddrs(inconsistencies) {
    const set = new Set();
    for (const inc of inconsistencies) {
      if (inc.state === 'tutarlı') continue;
      for (const o of inc.outliers) for (const cell of o.cells) set.add(cell.addr);
    }
    return set;
  }

  // Verilen sheet'in formüllerinin doğrudan referans verdiği diğer sheet
  // adlarını döner. allSheetNames verilirse workbook'ta gerçekten
  // bulunmayan referanslar (yazım hatası vb.) elenir. Self-reference dahil
  // edilmez.
  function findReferencedSheets(sheet, allSheetNames) {
    const refs = new Set();
    if (!sheet.patternGroups) return [];
    for (const g of sheet.patternGroups.values()) {
      for (const rawRef of g.sheetRefs) {
        let name = rawRef.replace(/!$/, '');
        // Tırnaklı sheet adı: 'My Sheet'! → My Sheet, '' kaçışı → '
        if (name.startsWith("'") && name.endsWith("'")) {
          name = name.slice(1, -1).replace(/''/g, "'");
        }
        if (!name) continue;
        if (name === sheet.name) continue;
        if (allSheetNames && !allSheetNames.includes(name)) continue;
        refs.add(name);
      }
    }
    return [...refs];
  }

  return {
    MAJORITY_THRESHOLD,
    findInconsistencies,
    aggregateConstants,
    aggregateExternalLinks,
    aggregateCrossSheetRefs,
    findOneOffFormulas,
    collectInconsistencyOutlierAddrs,
    findReferencedSheets,
  };
})();
