// Markdown rapor montajı. IIFE + global namespace (window.EA.markdown).

window.EA = window.EA || {};
window.EA.markdown = (function () {
  const { hiddenLabel } = window.EA.parse;
  const { compactRanges } = window.EA.patterns;

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

  // Triage'da işaretlenen değerleri maskeler. Set boş/yoksa normal format.
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

  function renderSummary(sheets, totals, namedRanges, externalLinks) {
    const visibleCount = sheets.filter((s) => s.hidden === 0).length;
    const hiddenCount = sheets.length - visibleCount;
    return [
      '## Genel Özet',
      '',
      `- Toplam sheet: ${sheets.length} (gizli: ${hiddenCount})`,
      `- Toplam formül: ${totals.formulas}`,
      `- Benzersiz formül paterni: ${totals.patterns}`,
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
      '| # | Ad | Aralık | Görünürlük | Formül | Patern | Sapma |',
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

  function renderPatternTable(sheet, sensitive) {
    const groups = sheet.patternGroups;
    if (!groups || groups.size === 0) return '';
    const sorted = [...groups.values()].sort((a, b) => b.cells.length - a.cells.length);
    const lines = [
      `### Formül Desenleri (${groups.size} benzersiz, ${sheet.formulas.length} formül)`,
      '',
      '| Aralık | Patern | Adet | Örnek Değer | Sabit Değerler |',
      '|--------|--------|------|-------------|----------------|',
    ];
    for (const g of sorted) {
      const ranges = compactRanges(g.cells);
      const rangeStr = joinTrimmed(ranges, 60);
      const sampleVal = maskedValue(g.sample.v, sensitive);
      const consts = g.numericConstants.length ? '`' + g.numericConstants.join('`, `') + '`' : '';
      const patternEsc = escapeInlineCode(g.pattern);
      lines.push(`| \`${rangeStr}\` | \`${patternEsc}\` | ${g.cells.length} | ${sampleVal} | ${consts} |`);
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
      const head = `**Sütun ${inc.colLetter}** — ${inc.total} formül, ${inc.patternCount} patern, durum: \`${inc.state}\``;
      lines.push(`- ${head}`);
      if (inc.state === 'sapma') {
        const m = inc.majority;
        const mRanges = joinTrimmed(compactRanges(m.cells), 80);
        lines.push(`  - Çoğunluk (${m.cells.length}): \`${escapeInlineCode(m.pattern)}\` — \`${mRanges}\``);
        for (const o of inc.outliers) {
          const oAddrs = joinTrimmed(o.cells.map((c) => c.addr), 100);
          lines.push(`  - Sapma (${o.cells.length}): \`${escapeInlineCode(o.pattern)}\` — \`${oAddrs}\``);
        }
      } else {
        for (const o of inc.outliers) {
          const oRanges = joinTrimmed(compactRanges(o.cells), 80);
          lines.push(`  - ${o.cells.length}× \`${escapeInlineCode(o.pattern)}\` — \`${oRanges}\``);
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
      '| Değer | Hücre Adedi | Patern Sayısı | Örnek Patern |',
      '|-------|-------------|---------------|---------------|',
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
      '| Hedef | Hücre Adedi | Patern Sayısı | Örnek Patern |',
      '|-------|-------------|---------------|---------------|',
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
      '| Hücre | Patern | Değer |',
      '|-------|--------|-------|',
    ];
    for (const o of oneOffs) {
      lines.push(`| ${o.addr} | \`${escapeInlineCode(o.pattern)}\` | ${maskedValue(o.value, sensitive)} |`);
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

    lines.push(renderPatternTable(sheet, sensitive));
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
      '| Hedef | Hücre Adedi | Patern Sayısı | Görüldüğü Sheet\'ler | Örnek Patern |',
      '|-------|-------------|---------------|---------------------|---------------|',
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

  function buildReport({ fileMeta, sheets, namedRanges, externalLinks, sensitive }) {
    const totals = computeTotals(sheets);
    const parts = [
      renderHeader(fileMeta),
      renderSummary(sheets, totals, namedRanges, externalLinks),
      renderRedactionNote(sensitive),
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

  return { buildReport };
})();
