// Markdown rapor montajı. Her milestone'da bu modül büyür.

import { hiddenLabel } from './parse.js';

const NL = '\n';

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
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

function renderSheetList(sheets) {
  const visibleCount = sheets.filter((s) => s.hidden === 0).length;
  const hiddenCount = sheets.length - visibleCount;
  const lines = [
    '## Genel Özet',
    '',
    `- Toplam sheet: ${sheets.length} (gizli: ${hiddenCount})`,
    '',
    '## Sheet Listesi',
    '',
    '| # | Ad | Aralık | Görünürlük |',
    '|---|----|--------|------------|',
  ];
  sheets.forEach((s, i) => {
    const label = hiddenLabel(s.hidden);
    const vis = label ? `**${label.toUpperCase()}**` : 'görünür';
    const range = s.ref ?? '_(boş)_';
    const safeName = s.name.replace(/\|/g, '\\|');
    lines.push(`| ${i + 1} | ${safeName} | \`${range}\` | ${vis} |`);
  });
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
  const parts = [
    renderHeader(fileMeta),
    renderSheetList(sheets),
    renderVbaPlaceholder(),
  ];
  return parts.join(NL);
}
