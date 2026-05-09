// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Samet Bellur
//
// Markdown rapor montajı. IIFE + global namespace (window.EA.markdown).

window.EA = window.EA || {};
window.EA.markdown = (function () {
  const { hiddenLabel } = window.EA.parse;
  const { compactRanges, reconstructFormula } = window.EA.patterns;

  const NL = '\n';

  function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  function escapeCell(s) {
    if (s == null) return '';
    return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/\r/g, '');
  }

  function escapeInlineCode(s) {
    return escapeCell(s).replace(/`/g, '\\`');
  }

  function fmtValue(v) {
    if (v == null) return '';
    if (typeof v === 'number') {
      if (!isFinite(v)) return String(v);
      return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, '');
    }
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  }

  function maskedValue(v, sensitive) {
    const f = fmtValue(v);
    if (sensitive && sensitive.has(f)) return '`***`';
    return escapeCell(f);
  }

  function joinTrimmed(arr, max = 80) {
    const s = arr.join(', ');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function renderHeader({ fileName, fileSize, fileType }) {
    return [
      `# Excel Denetim Raporu: ${fileName}`,
      '',
      `**Üretim tarihi:** ${new Date().toISOString()}  `,
      `**Dosya tipi:** ${fileType}  `,
      `**Dosya boyutu:** ${fmtBytes(fileSize)}`,
      '',
    ].join(NL);
  }

  function renderSummary(sheets, totals, namedRanges, externalLinks, templates) {
    const visibleCount = sheets.filter((s) => s.hidden === 0).length;
    const hiddenCount = sheets.length - visibleCount;
    const tplTotal = templates ? templates.length : 0;
    const tplMulti = templates ? templates.filter((t) => t.sheetCount > 1).length : 0;
    return [
      '## Genel Özet',
      '',
      `- Toplam sheet: ${sheets.length} (gizli: ${hiddenCount})`,
      `- Toplam formül: ${totals.formulas}`,
      `- Benzersiz şablon (skeleton): ${tplTotal} (çoklu-sheet: ${tplMulti})`,
      `- Tutarsız sütun: ${totals.inconsistentCols} (sapma: ${totals.deviationCols}, karışık: ${totals.mixedCols})`,
      `- Hardcoded sayısal sabit (benzersiz): ${totals.constants}`,
      `- Çapraz sayfa referansı (benzersiz hedef): ${totals.crossSheetTargets}`,
      `- Named range: ${namedRanges?.length ?? 0}`,
      `- External link (benzersiz dosya): ${externalLinks?.length ?? 0}`,
      '',
    ].join(NL);
  }

  function renderSheetListing(sheets) {
    const lines = [
      '## Sheet Listesi',
      '',
      '| # | Ad | Aralık | Görünürlük | Formül | Şablon | Sapma |',
      '|---|----|--------|------------|--------|--------|-------|',
    ];
    sheets.forEach((s, i) => {
      const label = hiddenLabel(s.hidden);
      const vis = label ? `**${label.toUpperCase()}**` : 'görünür';
      const range = s.ref ?? '_(boş)_';
      const safeName = escapeCell(s.name);
      const fc = s.formulas ? s.formulas.length : 0;
      const pc = s.patternGroups ? s.patternGroups.size : 0;
      const dev = s.inconsistencies
        ? s.inconsistencies.filter((c) => c.state !== 'tutarlı').length
        : 0;
      lines.push(`| ${i + 1} | ${safeName} | \`${range}\` | ${vis} | ${fc} | ${pc} | ${dev} |`);
    });
    lines.push('');
    return lines.join(NL);
  }

  // Pozisyonel histogram'ı insan-okur yazar string'e çevirir.
  // Tek pozisyon, tek değer → "1.18 (100)"
  // Tek pozisyon, çok değer → "1.18 (98), 1.20 (2) ⚠"
  // Çok pozisyon → "p1: 1.5 (50); p2: 2 (50)"
  function fmtHistograms(mergedHistograms, positionStates) {
    if (!mergedHistograms || mergedHistograms.length === 0) return '';
    const partLabels = mergedHistograms.length > 1;
    const parts = [];
    for (let i = 0; i < mergedHistograms.length; i++) {
      const h = mergedHistograms[i];
      const sorted = [...h.entries()].sort((a, b) => b[1] - a[1]);
      const pieces = sorted.map(([v, c]) => `${escapeCell(v)} (${c})`);
      let segment = pieces.join(', ');
      if (positionStates && positionStates[i] && positionStates[i] !== 'tutarlı') {
        segment += ' ⚠';
      }
      parts.push(partLabels ? `p${i + 1}: ${segment}` : segment);
    }
    return parts.join('; ');
  }

  // Şablonların perSheet bilgisini "Sheet: aralıklar" formatında özet
  // bir satıra dönüştürür. Sheet sayısı 4'ten fazlaysa ilk 3 + "+N
  // sheet" gösterilir (LLM token tasarrufu).
  function fmtPerSheet(perSheet) {
    const items = perSheet.map((p) => {
      const ranges = joinTrimmed(p.ranges, 50);
      return `${escapeCell(p.sheet)}: ${ranges}`;
    });
    if (items.length <= 4) return items.join('; ');
    return items.slice(0, 3).join('; ') + `; +${items.length - 3} sheet daha`;
  }

  function fmtOutlierCells(outliers) {
    if (!outliers || outliers.length === 0) return '';
    if (outliers.length <= 6) {
      return outliers
        .map((o) => `${escapeCell(o.sheet)}!${o.addr}=${escapeCell(o.value)}`)
        .join(', ');
    }
    const head = outliers
      .slice(0, 5)
      .map((o) => `${escapeCell(o.sheet)}!${o.addr}=${escapeCell(o.value)}`)
      .join(', ');
    return `${head}, +${outliers.length - 5} daha`;
  }

  // Workbook seviyesi şablonlar (skeleton dedup + sabit histogramları).
  function renderTemplatesTable(templates) {
    if (!templates || templates.length === 0) return '';
    const lines = [
      `## Şablonlar (Workbook Geneli)`,
      '',
      `${templates.length} benzersiz şablon (skeleton). Aynı skeleton'ı paylaşan formüller — farklı sheet/satırlarda olsalar da — burada tek satırda toplanır. Sayısal sabitler skeleton'da \`{const}\` olarak abstrakte edilmiştir; gerçek değerler "Sabit Dağılımı" kolonunda.`,
      '',
      '| Şablon | Sheet+Aralıklar | Hücre | Sabit Dağılımı | Not |',
      '|--------|------------------|-------|-----------------|-----|',
    ];
    for (const t of templates) {
      const sk = '`' + escapeInlineCode(t.skeleton) + '`';
      const perSheet = fmtPerSheet(t.perSheet);
      const histograms = fmtHistograms(t.mergedHistograms, t.positionStates);
      let note = '';
      if (t.constantState === 'sapma') {
        note = `Sabit sapması — outlier: ${fmtOutlierCells(t.outlierConstantCells)}`;
      } else if (t.constantState === 'karışık') {
        note = 'Sabitler karışık (çoğunluk yok)';
      } else if (t.sheetCount > 1) {
        note = `Çoklu-sheet (${t.sheetCount}) — şablon birebir tutarlı`;
      }
      lines.push(
        `| ${sk} | ${perSheet} | ${t.totalCells} | ${histograms || '_yok_'} | ${note} |`
      );
    }
    lines.push('');
    return lines.join(NL);
  }

  function renderInconsistencies(sheet) {
    const incs = sheet.inconsistencies ?? [];
    const flagged = incs.filter((c) => c.state !== 'tutarlı');
    if (flagged.length === 0) return '';

    const lines = ['### Tutarsızlıklar', ''];
    for (const inc of flagged) {
      const head = `**Sütun ${inc.colLetter}** — ${inc.total} formül, ${inc.skeletonCount} farklı skeleton, durum: \`${inc.state}\``;
      lines.push(`- ${head}`);
      if (inc.state === 'sapma') {
        const m = inc.majority;
        const mRanges = joinTrimmed(compactRanges(m.cells), 80);
        lines.push(`  - Çoğunluk (${m.cells.length}): \`${escapeInlineCode(m.skeleton)}\` — \`${mRanges}\``);
        for (const o of inc.outliers) {
          const oAddrs = joinTrimmed(o.cells.map((c) => c.addr), 100);
          lines.push(`  - Sapma (${o.cells.length}): \`${escapeInlineCode(o.skeleton)}\` — \`${oAddrs}\``);
        }
      } else {
        for (const o of inc.outliers) {
          const oRanges = joinTrimmed(compactRanges(o.cells), 80);
          lines.push(`  - ${o.cells.length}× \`${escapeInlineCode(o.skeleton)}\` — \`${oRanges}\``);
        }
      }
    }
    lines.push('');
    return lines.join(NL);
  }

  function renderConstantsTable(sheet) {
    const consts = sheet.constants ?? [];
    if (consts.length === 0) return '';
    const lines = [
      '### Sabit Değerler',
      '',
      '| Değer | Hücre Adedi | Şablon Sayısı | Örnek Şablon |',
      '|-------|-------------|----------------|----------------|',
    ];
    for (const c of consts) {
      const sample = c.samplePatterns[0] ? '`' + escapeInlineCode(c.samplePatterns[0]) + '`' : '';
      lines.push(`| \`${escapeCell(c.value)}\` | ${c.cellCount} | ${c.patternCount} | ${sample} |`);
    }
    lines.push('');
    return lines.join(NL);
  }

  function renderCrossSheetRefs(sheet) {
    const refs = sheet.crossSheetRefs ?? [];
    if (refs.length === 0) return '';
    const lines = [
      '### Çapraz Sayfa Referansları',
      '',
      '| Hedef | Hücre Adedi | Şablon Sayısı | Örnek Şablon |',
      '|-------|-------------|----------------|----------------|',
    ];
    for (const r of refs) {
      const sample = r.samplePatterns[0] ? '`' + escapeInlineCode(r.samplePatterns[0]) + '`' : '';
      lines.push(`| \`${escapeCell(r.targetSheet)}\` | ${r.cellCount} | ${r.patternCount} | ${sample} |`);
    }
    lines.push('');
    return lines.join(NL);
  }

  function renderOneOffs(sheet, sensitive) {
    const oneOffs = sheet.oneOffs ?? [];
    if (oneOffs.length === 0) return '';
    const lines = [
      `### Tek Seferlik Formüller (${oneOffs.length})`,
      '',
      '| Hücre | Formül | Değer |',
      '|-------|--------|-------|',
    ];
    for (const o of oneOffs) {
      // Skeleton + constants → gerçek formül (okunabilir).
      const formula = reconstructFormula(o.skeleton, o.constants);
      lines.push(`| ${o.addr} | \`${escapeInlineCode(formula)}\` | ${maskedValue(o.value, sensitive)} |`);
    }
    lines.push('');
    return lines.join(NL);
  }

  function renderSheetSection(sheet, sensitive) {
    const label = hiddenLabel(sheet.hidden);
    const visTag = label ? ` *(${label.toUpperCase()})*` : '';
    const lines = [
      `## Sheet: ${escapeCell(sheet.name)}${visTag}`,
      '',
      `**Kullanılan aralık:** \`${sheet.ref ?? '(boş)'}\``,
      '',
    ];

    const formulas = sheet.formulas ?? [];
    if (!formulas.length) {
      lines.push('_Bu sheet\'te formül bulunamadı._', '');
      return lines.join(NL);
    }

    // Sheet özeti — şablon ayrıntısı workbook-seviyesi tablosunda
    const groupCount = sheet.patternGroups?.size ?? 0;
    lines.push(`**Şablon sayısı:** ${groupCount} (ayrıntı için yukarıdaki "Şablonlar" tablosuna bakın)`, '');

    const incBlock = renderInconsistencies(sheet);
    if (incBlock) lines.push(incBlock);
    const constBlock = renderConstantsTable(sheet);
    if (constBlock) lines.push(constBlock);
    const crossBlock = renderCrossSheetRefs(sheet);
    if (crossBlock) lines.push(crossBlock);
    const oneOffBlock = renderOneOffs(sheet, sensitive);
    if (oneOffBlock) lines.push(oneOffBlock);

    return lines.join(NL);
  }

  function renderNamedRanges(namedRanges) {
    if (!namedRanges || namedRanges.length === 0) {
      return ['## Named Ranges', '', '_Named range tanımı bulunamadı._', ''].join(NL);
    }
    const lines = [
      '## Named Ranges',
      '',
      '| İsim | Referans | Kapsam | Yorum |',
      '|------|----------|--------|-------|',
    ];
    for (const n of namedRanges) {
      const scope = n.scope ? `Sheet: ${escapeCell(n.scope)}` : 'Çalışma kitabı geneli';
      const ref = n.ref ? '`' + escapeCell(n.ref) + '`' : '';
      lines.push(`| ${escapeCell(n.name)} | ${ref} | ${scope} | ${escapeCell(n.comment)} |`);
    }
    lines.push('');
    return lines.join(NL);
  }

  function renderExternalLinks(externalLinks) {
    if (!externalLinks || externalLinks.length === 0) {
      return ['## External Links', '', '_External link bulunamadı._', ''].join(NL);
    }
    const lines = [
      '## External Links',
      '',
      '| Hedef | Hücre Adedi | Şablon Sayısı | Görüldüğü Sheet\'ler | Örnek Şablon |',
      '|-------|-------------|----------------|---------------------|----------------|',
    ];
    for (const e of externalLinks) {
      const sample = e.samplePatterns[0] ? '`' + escapeInlineCode(e.samplePatterns[0]) + '`' : '';
      const sheetList = joinTrimmed(e.sheets, 60);
      lines.push(
        `| \`${escapeCell(e.target)}\` | ${e.cellCount} | ${e.patternCount} | ${escapeCell(sheetList)} | ${sample} |`
      );
    }
    lines.push('');
    return lines.join(NL);
  }

  function renderHiddenItems(sheets) {
    const hidden = sheets.filter((s) => s.hidden !== 0);
    if (hidden.length === 0) {
      return ['## Gizli Öğeler', '', '_Gizli sheet bulunamadı._', ''].join(NL);
    }
    const lines = [
      '## Gizli Öğeler',
      '',
      '| Sheet | Görünürlük | Aralık | Formül |',
      '|-------|------------|--------|--------|',
    ];
    for (const s of hidden) {
      const label = hiddenLabel(s.hidden);
      const fc = s.formulas?.length ?? 0;
      lines.push(
        `| ${escapeCell(s.name)} | **${label.toUpperCase()}** | \`${s.ref ?? '(boş)'}\` | ${fc} |`
      );
    }
    lines.push('');
    return lines.join(NL);
  }

  function renderVbaPlaceholder() {
    return [
      '## VBA Makroları',
      '',
      '_(Bu sürümde VBA çıkarma henüz aktif değil — M6\'da gelecek.)_',
      '',
    ].join(NL);
  }

  function computeTotals(sheets) {
    let formulas = 0, patterns = 0, deviationCols = 0, mixedCols = 0;
    const allConstants = new Set();
    const allCrossSheets = new Set();
    for (const s of sheets) {
      formulas += s.formulas?.length ?? 0;
      patterns += s.patternGroups?.size ?? 0;
      for (const c of s.constants ?? []) allConstants.add(c.value);
      for (const r of s.crossSheetRefs ?? []) allCrossSheets.add(r.targetSheet);
      for (const inc of s.inconsistencies ?? []) {
        if (inc.state === 'sapma') deviationCols++;
        else if (inc.state === 'karışık') mixedCols++;
      }
    }
    return {
      formulas,
      patterns,
      deviationCols,
      mixedCols,
      inconsistentCols: deviationCols + mixedCols,
      constants: allConstants.size,
      crossSheetTargets: allCrossSheets.size,
    };
  }

  function renderRedactionNote(sensitive) {
    if (!sensitive || sensitive.size === 0) return '';
    return [
      '## Redaction',
      '',
      `Kullanıcı tarafından **${sensitive.size}** benzersiz değer hassas işaretlendi ve raporda \`***\` olarak gizlendi.`,
      '',
    ].join(NL);
  }

  function buildReport({ fileMeta, sheets, namedRanges, externalLinks, sensitive, templates }) {
    const totals = computeTotals(sheets);
    const parts = [
      renderHeader(fileMeta),
      renderSummary(sheets, totals, namedRanges, externalLinks, templates),
      renderRedactionNote(sensitive),
      renderTemplatesTable(templates),
      renderSheetListing(sheets),
      '---',
      '',
      ...sheets.map((s) => renderSheetSection(s, sensitive)),
      '---',
      '',
      renderNamedRanges(namedRanges),
      renderExternalLinks(externalLinks),
      renderHiddenItems(sheets),
      renderVbaPlaceholder(),
    ];
    return parts.filter((p) => p !== '').join(NL);
  }

  // Subset rapor: odak sheet + bağlı sheet'ler. Şablonlar tablosu da
  // sadece bu sheet'lere indirgenir.
  function buildSubsetReport({ fileMeta, allSheets, focusSheetName, includedSheetNames, sensitive, templates }) {
    const subset = allSheets.filter((s) => includedSheetNames.includes(s.name));
    const refSheetNames = includedSheetNames.filter((n) => n !== focusSheetName);
    const totals = computeTotals(subset);

    // Şablonları subset'e filtrele: en az bir perSheet entry'si dahil
    // edilen sheet'lerden biri olan şablonları al; perSheet listesini
    // de subset'e indir.
    let subsetTemplates = null;
    if (templates) {
      subsetTemplates = templates
        .map((t) => {
          const filteredPerSheet = t.perSheet.filter((p) =>
            includedSheetNames.includes(p.sheet)
          );
          if (filteredPerSheet.length === 0) return null;
          const totalCells = filteredPerSheet.reduce((n, p) => n + p.cells.length, 0);
          return {
            ...t,
            perSheet: filteredPerSheet,
            sheetCount: filteredPerSheet.length,
            totalCells,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.totalCells - a.totalCells);
    }

    const refsList = refSheetNames.length
      ? refSheetNames.map((n) => '`' + escapeCell(n) + '`').join(', ')
      : '_(yok — bu sheet diğer sheet\'lere referans vermiyor)_';

    const header = [
      `# Excel Denetim Raporu (Alt Küme): ${fileMeta.fileName}`,
      '',
      `**Üretim tarihi:** ${new Date().toISOString()}  `,
      `**Odak sheet:** \`${escapeCell(focusSheetName)}\`  `,
      `**Çapraz referansla dahil edilen (${refSheetNames.length}):** ${refsList}`,
      '',
      `Bu alt küme \`${escapeCell(focusSheetName)}\` sheet'i ve içindeki formüllerin doğrudan referans verdiği sheet'leri içerir. Workbook geneli bilgiler (Named Ranges, External Links, Gizli Öğeler, VBA) dahil değildir.`,
      '',
    ].join(NL);

    const summary = [
      '## Alt Küme Özeti',
      '',
      `- Sheet sayısı: ${subset.length}`,
      `- Toplam formül: ${totals.formulas}`,
      `- Şablon: ${subsetTemplates ? subsetTemplates.length : '?'}`,
      `- Tutarsız sütun: ${totals.inconsistentCols} (sapma: ${totals.deviationCols}, karışık: ${totals.mixedCols})`,
      '',
    ].join(NL);

    const parts = [
      header,
      summary,
      renderRedactionNote(sensitive),
      renderTemplatesTable(subsetTemplates),
      '---',
      '',
      ...subset.map((s) => renderSheetSection(s, sensitive)),
    ];
    return parts.filter((p) => p !== '').join(NL);
  }

  return { buildReport, buildSubsetReport };
})();
