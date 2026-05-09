// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Samet Bellur
//
// Sheet ve workbook seviyesinde tutarsızlık, sabit ve çapraz referans
// analizi. Skeleton-keyed pattern gruplarından beslenir; ham formülleri
// yeniden tokenize etmez. IIFE + global namespace (window.EA.analysis).

window.EA = window.EA || {};
window.EA.analysis = (function () {
  const MAJORITY_THRESHOLD = 0.8;

  // Hücre → skeleton (group key) lookup'u.
  function buildCellToSkeleton(groups) {
    const m = new Map();
    for (const g of groups.values()) {
      for (const cell of g.cells) m.set(cell.addr, g.skeleton);
    }
    return m;
  }

  // Sütun bazlı tutarsızlık. Skeleton düzeyinde gruplar, aynı skeleton
  // varsa "tutarlı"; farklı skeleton'lar varsa çoğunluk/sapma/karışık.
  function findInconsistencies(formulas, groups) {
    const c2s = buildCellToSkeleton(groups);
    const byCol = new Map();
    for (const f of formulas) {
      if (!byCol.has(f.col)) byCol.set(f.col, []);
      byCol.get(f.col).push(f);
    }

    const results = [];
    for (const [col, cells] of byCol) {
      const counts = new Map();
      for (const cell of cells) {
        const s = c2s.get(cell.addr);
        if (!counts.has(s)) counts.set(s, []);
        counts.get(s).push(cell);
      }
      const sorted = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);
      const total = cells.length;

      let state, majority = null, outliers = [];
      if (sorted.length === 1) {
        state = 'tutarlı';
        majority = { skeleton: sorted[0][0], cells: sorted[0][1] };
      } else if (sorted[0][1].length / total >= MAJORITY_THRESHOLD) {
        state = 'sapma';
        majority = { skeleton: sorted[0][0], cells: sorted[0][1] };
        outliers = sorted.slice(1).map(([s, cs]) => ({ skeleton: s, cells: cs }));
      } else {
        state = 'karışık';
        outliers = sorted.map(([s, cs]) => ({ skeleton: s, cells: cs }));
      }

      results.push({
        col,
        colLetter: cells[0].colLetter,
        total,
        skeletonCount: sorted.length,
        state,
        majority,
        outliers,
      });
    }
    return results.sort((a, b) => a.col - b.col);
  }

  // Sheet seviyesinde sayısal sabitleri toplar. Skeleton-keyed gruplarda
  // her hücrenin kendi sabit listesi farklı olabileceği için
  // cellConstants üzerinden hesaplanır (eski "her sabiti grup boyutuyla
  // çarp" mantığı doğru olmaz).
  function aggregateConstants(groups) {
    const map = new Map();
    for (const g of groups.values()) {
      if (!g.cellConstants) continue;
      for (const constants of g.cellConstants.values()) {
        for (const c of constants) {
          let entry = map.get(c);
          if (!entry) {
            entry = { value: c, cellCount: 0, skeletons: new Set() };
            map.set(c, entry);
          }
          entry.cellCount++;
          entry.skeletons.add(g.skeleton);
        }
      }
    }
    return [...map.values()]
      .map((e) => ({
        value: e.value,
        cellCount: e.cellCount,
        patternCount: e.skeletons.size,
        samplePatterns: [...e.skeletons].slice(0, 3),
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
            entry = { target: ext, cellCount: 0, skeletons: new Set(), sheets: new Set() };
            map.set(ext, entry);
          }
          entry.cellCount += g.cells.length;
          entry.skeletons.add(g.skeleton);
          entry.sheets.add(s.name);
        }
      }
    }
    return [...map.values()]
      .map((e) => ({
        target: e.target.replace(/^\[/, '').replace(/\]$/, ''),
        cellCount: e.cellCount,
        patternCount: e.skeletons.size,
        samplePatterns: [...e.skeletons].slice(0, 3),
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
          entry = { ref, cellCount: 0, skeletons: new Set() };
          map.set(ref, entry);
        }
        entry.cellCount += g.cells.length;
        entry.skeletons.add(g.skeleton);
      }
    }
    return [...map.values()]
      .map((e) => ({
        targetSheet: e.ref.replace(/!$/, ''),
        cellCount: e.cellCount,
        patternCount: e.skeletons.size,
        samplePatterns: [...e.skeletons].slice(0, 3),
      }))
      .sort((a, b) => b.cellCount - a.cellCount);
  }

  // Tek hücreli skeleton grupları (ad-hoc / tek-seferlik formüller).
  // Tutarsızlık raporunda outlier olarak görünenler hariç bırakılır.
  function findOneOffFormulas(groups, inconsistencyOutlierAddrs) {
    const out = [];
    for (const g of groups.values()) {
      if (g.cells.length !== 1) continue;
      const cell = g.cells[0];
      if (inconsistencyOutlierAddrs.has(cell.addr)) continue;
      const constants = g.cellConstants ? g.cellConstants.get(cell.addr) || [] : [];
      out.push({
        addr: cell.addr,
        skeleton: g.skeleton,
        constants,
        value: cell.v,
      });
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

  function findReferencedSheets(sheet, allSheetNames) {
    const refs = new Set();
    if (!sheet.patternGroups) return [];
    for (const g of sheet.patternGroups.values()) {
      for (const rawRef of g.sheetRefs) {
        let name = rawRef.replace(/!$/, '');
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

  // Workbook seviyesinde aynı skeleton'ı paylaşan tüm pattern gruplarını
  // tek bir "şablon" altında birleştirir. Cross-sheet dedup + sabit
  // histogramlarını birleştirme + outlier sabit hücre tespiti.
  //
  // Dönüş: [{
  //   skeleton, sheetCount, totalCells,
  //   perSheet: [{sheet, cells, ranges, histograms}],   // sıralı
  //   mergedHistograms: [Map<value, count>],            // pozisyon başına
  //   outlierConstantCells: [{sheet, addr, position, value}],
  //                                                     // azınlık sabit
  //   constantState: 'tutarlı'|'sapma'|'karışık'|'yok',
  // }] — totalCells desc.
  function aggregateTemplatesAcrossSheets(sheets, compactRanges) {
    // Skeleton → templates map.
    const tpl = new Map();
    for (const s of sheets) {
      const groups = s.patternGroups;
      if (!groups) continue;
      for (const g of groups.values()) {
        let t = tpl.get(g.skeleton);
        if (!t) {
          t = {
            skeleton: g.skeleton,
            perSheet: [],
            totalCells: 0,
            sheetCount: 0,
            mergedHistograms: g.constantHistograms.map(() => new Map()),
            sheetRefs: new Set(),
            extRefs: new Set(),
          };
          tpl.set(g.skeleton, t);
        }
        // Per-sheet bilgi
        const ranges = compactRanges ? compactRanges(g.cells) : [];
        t.perSheet.push({
          sheet: s.name,
          cells: g.cells,
          ranges,
          histograms: g.constantHistograms,
          cellConstants: g.cellConstants,
        });
        t.totalCells += g.cells.length;
        t.sheetCount++;
        // Histogramları birleştir
        for (let i = 0; i < g.constantHistograms.length; i++) {
          const merged = t.mergedHistograms[i] ?? new Map();
          for (const [val, cnt] of g.constantHistograms[i]) {
            merged.set(val, (merged.get(val) || 0) + cnt);
          }
          t.mergedHistograms[i] = merged;
        }
        for (const r of g.sheetRefs) t.sheetRefs.add(r);
        for (const x of g.extRefs) t.extRefs.add(x);
      }
    }

    // Outlier sabit tespiti
    const result = [];
    for (const t of tpl.values()) {
      const outlierConstantCells = [];
      let state = 'yok'; // sabit yok
      let positionStates = [];
      if (t.mergedHistograms.length > 0) {
        let allConsistent = true;
        let allMixed = true;
        for (let i = 0; i < t.mergedHistograms.length; i++) {
          const h = t.mergedHistograms[i];
          const total = [...h.values()].reduce((a, b) => a + b, 0);
          const sortedH = [...h.entries()].sort((a, b) => b[1] - a[1]);
          let posState;
          if (sortedH.length === 1) {
            posState = 'tutarlı';
          } else if (sortedH[0][1] / total >= MAJORITY_THRESHOLD) {
            posState = 'sapma';
            const majority = sortedH[0][0];
            // Outlier hücreleri bul
            for (const ps of t.perSheet) {
              if (!ps.cellConstants) continue;
              for (const [addr, consts] of ps.cellConstants.entries()) {
                if (consts[i] !== undefined && consts[i] !== majority) {
                  outlierConstantCells.push({
                    sheet: ps.sheet,
                    addr,
                    position: i,
                    value: consts[i],
                  });
                }
              }
            }
          } else {
            posState = 'karışık';
          }
          positionStates.push(posState);
          if (posState !== 'tutarlı') allConsistent = false;
          if (posState !== 'karışık') allMixed = false;
        }
        if (allConsistent) state = 'tutarlı';
        else if (allMixed) state = 'karışık';
        else state = 'sapma';
      }
      // perSheet'i isim sırasında düzenli tut
      t.perSheet.sort((a, b) => a.sheet.localeCompare(b.sheet));
      result.push({
        skeleton: t.skeleton,
        sheetCount: t.sheetCount,
        totalCells: t.totalCells,
        perSheet: t.perSheet,
        mergedHistograms: t.mergedHistograms,
        positionStates,
        constantState: state,
        outlierConstantCells,
      });
    }
    // Workbook'ta en yaygın şablonlar başta
    return result.sort((a, b) => b.totalCells - a.totalCells);
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
    aggregateTemplatesAcrossSheets,
  };
})();
