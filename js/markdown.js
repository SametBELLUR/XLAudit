// Markdown rapor montajı. Her milestone'da bu modül büyür.

import { hiddenLabel } from './parse.js';

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

function typeLabel(t) {
  switch (t) {
    case 'n': return 'sayı';
    case 's': return 'metin';
    case 'b': return 'mantık';
    case 'd': return 'tarih';
    case 'e': return 'hata';
    default:  return t ?? '';
  }
}

function renderHeader({ fileName, fileSize, fileType }) {
  const lines = [
    `# Excel Denetim Raporu: ${fileName}`,
    '',
    `**Üretim tarihi:** ${new Date().toISOString()}  `,
    `**Dosya tipi:** ${fileType}  `,
    `**Dosya boyutu:** ${fmtBytes(fileSize)}`,
    '',
  ];
  return lines.join(NL);
}

function renderSummary(sheets, totalFormulas) {
  const visibleCount = sheets.filter((s) => s.hidden === 0).length;
  const hiddenCount = sheets.length - visibleCount;
  return [
    '## Genel Özet',
    '',
    `- Toplam sheet: ${sheets.length} (gizli: ${hiddenCount})`,
    `- Toplam formül: ${totalFormulas}`,
    '',
  ].join(NL);
}

function renderSheetListing(sheets) {
  const lines = [
    '## Sheet Listesi',
    '',
    '| # | Ad | Aralık | Görünürlük | Formül Sayısı |',
    '|---|----|--------|------------|---------------|',
  ];
  sheets.forEach((s, i) => {
    const label = hiddenLabel(s.hidden);
    const vis = label ? `**${label.toUpperCase()}**` : 'görünür';
    const range = s.ref ?? '_(boş)_';
    const safeName = escapeCell(s.name);
    const fc = s.formulas ? s.formulas.length : 0;
    lines.push(`| ${i + 1} | ${safeName} | \`${range}\` | ${vis} | ${fc} |`);
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
  if (formulas.length === 0) {
    lines.push('_Bu sheet\'te formül bulunamadı._', '');
    return lines.join(NL);
  }

  lines.push(`### Formüller (${formulas.length})`, '');
  lines.push('| Hücre | Formül | Tip | Değer |');
  lines.push('|-------|--------|-----|-------|');
  for (const f of formulas) {
    const formula = '`=' + escapeCell(f.f) + '`';
    const value = escapeCell(fmtValue(f.v));
    lines.push(`| ${f.addr} | ${formula} | ${typeLabel(f.t)} | ${value} |`);
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
  const parts = [
    renderHeader(fileMeta),
    renderSummary(sheets, totalFormulas),
    renderSheetListing(sheets),
    '---',
    '',
    ...sheets.map(renderSheetSection),
    renderVbaPlaceholder(),
  ];
  return parts.join(NL);
}
