// SheetJS workbook yükleme ve sheet meta toplama.

const READ_OPTS = {
  type: 'array',
  dense: true,
  cellFormula: true,
  cellStyles: false,
  cellHTML: false,
  cellText: false,
  cellDates: true,
  bookVBA: true,
};

export async function readWorkbook(arrayBuffer) {
  try {
    if (typeof XLSX === 'undefined') {
      return { ok: false, error: 'SheetJS (XLSX) yüklenmedi. CDN bağlantısını kontrol edin.' };
    }
    const wb = XLSX.read(new Uint8Array(arrayBuffer), READ_OPTS);
    return { ok: true, data: wb };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Workbook'tan her sheet için temel metadata toplar.
// M1 için: name, hidden flag, kullanılan aralık.
export function collectSheetMeta(wb) {
  const sheetDefs = wb.Workbook?.Sheets ?? [];
  return wb.SheetNames.map((name, i) => {
    const ws = wb.Sheets[name];
    const ref = ws && ws['!ref'] ? ws['!ref'] : null;
    const hidden = sheetDefs[i]?.Hidden ?? 0; // 0 visible, 1 hidden, 2 very hidden
    return { index: i, name, ref, hidden };
  });
}

export function hiddenLabel(hidden) {
  if (hidden === 1) return 'gizli';
  if (hidden === 2) return 'çok gizli';
  return null;
}

// Sparse (default) ve dense modu birlikte destekler.
function getCell(ws, r, c, addr) {
  if (ws['!data']) return ws['!data'][r]?.[c];
  return ws[addr];
}

// Bir worksheet'in tüm formül hücrelerini toplar.
// Dönüş: [{ addr, row(1-idx), col(0-idx), colLetter, f, v, t }]
export function collectFormulas(ws) {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const out = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = getCell(ws, r, c, addr);
      if (!cell || !cell.f) continue;
      out.push({
        addr,
        row: r + 1,
        col: c,
        colLetter: XLSX.utils.encode_col(c),
        f: cell.f,
        v: cell.v,
        t: cell.t,
      });
    }
  }
  return out;
}
