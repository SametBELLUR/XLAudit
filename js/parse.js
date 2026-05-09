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
