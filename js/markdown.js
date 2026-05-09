// Markdown rapor montajı. Her milestone'da bu modül büyür.

import { hiddenLabel } from './parse.js';
import { compactRanges } from './patterns.js';

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

function fmtValue(v) {
  if (v == null) return '';
  if (typeof v === 'number') {
    if (!isFinite(v)) return String(v);
    return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, '');
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
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

function renderSummary(sheets, totalFormulas, totalPatterns) {
  const visibleCount = sheets.filter((s) => s.hidden === 0).length;
  const hiddenCount = sheets.length - visibleCount;
  return [
    '## Genel Özet',
    '',
    `- Toplam sheet: ${sheets.length} (gizli: ${hiddenCount})`,
    `- Toplam formül: ${totalFormulas}`,
    `- Benzersiz formül paterni: ${totalPatterns}`,
    '',
  ].join(NL);
}

function renderSheetListing(sheets) {
  const lines = [
    '## Sheet Listesi',
    '',
    '| # | Ad | Aralık | Görünürlük | Formül | Patern |',
    '|---|----|--------|------------|--------|--------|',
  ];
  sheets.forEach((s, i) => {
    const label = hiddenLabel(s.hidden);
    const vis = label ? `**${label.toUpperCase()}**` : 'görünür';
    const range = s.ref ?? '_(boş)_';
    const safeName = escapeCell(s.name);
    const fc = s.formulas ? s.formulas.length : 0;
    const pc = s.patternGroups ? s.patternGroups.size : 0;
    lines.push(`| ${i + 1} | ${safeName} | \`${range}\` | ${vis} | ${fc} | ${pc} |`);
  });
  lines.push('');
  return lines.join(NL);
}

function renderSheetSection(sheet) {
  const label = hiddenLabel(sheet.hidden);
  const visTag = label ? ` *(${label.toUpperCase()})*` : '';
  const lines = [
    `## Sheet: ${escapeCell(sheet.name)}${visTag}`,
    '',
    `**Kullanılan aralık:** \`${sheet.ref ?? '(boş)'}\``,
    '',
  ];

  const formulas = sheet.formulas ?? [];
  const groups = sheet.patternGroups;
  if (!formulas.length || !groups || groups.size === 0) {
    lines.push('_Bu sheet\'te formül bulunamadı._', '');
    return lines.join(NL);
  }

  const sortedGroups = [...groups.values()].sort((a, b) => b.cells.length - a.cells.length);

  lines.push(`### Formül Desenleri (${groups.size} benzersiz, ${formulas.length} formül)`, '');
  lines.push('| Aralık | Patern | Adet | Örnek Değer | Sabit Değerler |');
  lines.push('|--------|--------|------|-------------|----------------|');
  for (const g of sortedGroups) {
    const ranges = compactRanges(g.cells);
    const rangeStr = joinTrimmed(ranges, 60);
    const sampleVal = escapeCell(fmtValue(g.sample.v));
    const consts = g.numericConstants.length ? '`' + g.numericConstants.join('`, `') + '`' : '';
    const patternEsc = escapeCell(g.pattern).replace(/`/g, '\\`');
    lines.push(`| \`${rangeStr}\` | \`${patternEsc}\` | ${g.cells.length} | ${sampleVal} | ${consts} |`);
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

export function buildReport({ fileMeta, sheets }) {
  const totalFormulas = sheets.reduce((n, s) => n + (s.formulas?.length ?? 0), 0);
  const totalPatterns = sheets.reduce((n, s) => n + (s.patternGroups?.size ?? 0), 0);
  const parts = [
    renderHeader(fileMeta),
    renderSummary(sheets, totalFormulas, totalPatterns),
    renderSheetListing(sheets),
    '---',
    '',
    ...sheets.map(renderSheetSection),
    renderVbaPlaceholder(),
  ];
  return parts.join(NL);
}
