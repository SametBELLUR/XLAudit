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

// Workbook seviyesindeki named range tanımlarını çıkarır.
// SheetJS'in Names yapısı: [{ Name, Ref, Sheet?, Comment? }]
// Sheet undefined ise workbook geneli; sayı ise o sayfa indeksine bağlı.
export function collectNamedRanges(wb) {
  const names = wb.Workbook?.Names ?? [];
  const sheetNames = wb.SheetNames ?? [];
  return names.map((n) => ({
    name: n.Name,
    ref: n.Ref ?? '',
    scope: typeof n.Sheet === 'number' ? sheetNames[n.Sheet] : null, // null = workbook geneli
    comment: n.Comment ?? '',
  }));
}

// ---- Excel_LLM_Config redaction sheet ----

const CONFIG_SHEET_NAMES = ['excel_llm_config', '_llm_config', 'llm_config'];

// Workbook'ta config sheet'i arar (case-insensitive).
export function findConfigSheet(wb) {
  for (const name of wb.SheetNames) {
    if (CONFIG_SHEET_NAMES.includes(name.toLowerCase())) return name;
  }
  return null;
}

// Config sheet'i tablo olarak okur ve redaction kurallarını çıkarır.
// Beklenen başlıklar: "Sheet", "Aralık" (zorunlu), "Mod", "Not" (opsiyonel).
// Türkçe / İngilizce başlık eşleştirmesi yapılır.
export function extractRedactionConfig(wb) {
  const sheetName = findConfigSheet(wb);
  if (!sheetName) {
    return { sheetName: null, rules: [], errors: [] };
  }
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws['!ref']) {
    return { sheetName, rules: [], errors: ['Config sayfası boş.'] };
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  if (rows.length < 2) {
    return { sheetName, rules: [], errors: ['Config sayfasında başlık dışında veri yok.'] };
  }

  const headers = rows[0].map((h) => String(h ?? '').trim().toLowerCase());
  const findIdx = (...keys) => {
    for (const k of keys) {
      const i = headers.indexOf(k);
      if (i !== -1) return i;
    }
    return -1;
  };
  const idxSheet = findIdx('sheet', 'sayfa');
  const idxRange = findIdx('aralık', 'aralik', 'range', 'rng');
  const idxMode  = findIdx('mod', 'mode');
  const idxNote  = findIdx('not', 'note', 'açıklama', 'aciklama');

  if (idxSheet === -1 || idxRange === -1) {
    return {
      sheetName,
      rules: [],
      errors: [
        `Config sayfasında 'Sheet' ve 'Aralık' kolonları zorunlu. Bulunan başlıklar: [${headers.join(', ')}]`,
      ],
    };
  }

  const rules = [];
  const errors = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sheet = String(row[idxSheet] ?? '').trim();
    const range = String(row[idxRange] ?? '').trim();
    if (!sheet && !range) continue;
    if (!sheet || !range) {
      errors.push(`Satır ${i + 1}: 'Sheet' ve 'Aralık' alanları zorunlu (boş satır atlanır).`);
      continue;
    }
    const mode = idxMode !== -1 ? String(row[idxMode] ?? '').trim().toLowerCase() : '';
    const note = idxNote !== -1 ? String(row[idxNote] ?? '').trim() : '';
    rules.push({
      sheet,
      range,
      mode: mode || 'hide_value',
      note,
      sourceRow: i + 1,
    });
  }
  return { sheetName, rules, errors };
}

// Bir kuralı (row, col) → bool eşleştiricisine çevirir.
// Desteklenen aralık biçimleri: A1, A1:B10, A:A, A:C, 1:1, 1:5, *
function compileRangeMatcher(rangeStr) {
  const r = rangeStr.replace(/\s+/g, '');
  if (r === '*') return () => true;

  if (r.includes(':')) {
    const [a, b] = r.split(':');
    const cellPat = /^\$?[A-Z]+\$?\d+$/;
    const colPat = /^\$?[A-Z]+$/;
    const rowPat = /^\$?\d+$/;
    if (cellPat.test(a) && cellPat.test(b)) {
      const parsed = XLSX.utils.decode_range(r.replace(/\$/g, ''));
      return (row, col) =>
        row >= parsed.s.r && row <= parsed.e.r && col >= parsed.s.c && col <= parsed.e.c;
    }
    if (colPat.test(a) && colPat.test(b)) {
      const cs = XLSX.utils.decode_col(a.replace(/\$/g, ''));
      const ce = XLSX.utils.decode_col(b.replace(/\$/g, ''));
      const lo = Math.min(cs, ce), hi = Math.max(cs, ce);
      return (row, col) => col >= lo && col <= hi;
    }
    if (rowPat.test(a) && rowPat.test(b)) {
      const rs = parseInt(a.replace(/\$/g, ''), 10) - 1;
      const re = parseInt(b.replace(/\$/g, ''), 10) - 1;
      const lo = Math.min(rs, re), hi = Math.max(rs, re);
      return (row, col) => row >= lo && row <= hi;
    }
    return null;
  }

  if (/^\$?[A-Z]+\$?\d+$/.test(r)) {
    const parsed = XLSX.utils.decode_cell(r.replace(/\$/g, ''));
    return (row, col) => row === parsed.r && col === parsed.c;
  }
  return null;
}

// Kural listesini sheet adına göre matcher map'ine derler.
// Dönüş: { matchers: Map<sheetName, [matcherFn]>, wildcards: [matcherFn], compiledRules, parseErrors }
//   sheetName='*' kuralları wildcards listesine düşer ve her sheet'te uygulanır.
export function compileRedactionRules(rules) {
  const matchers = new Map();
  const wildcards = [];
  const compiledRules = [];
  const parseErrors = [];
  for (const rule of rules) {
    const fn = compileRangeMatcher(rule.range);
    if (!fn) {
      parseErrors.push(
        `Kural satır ${rule.sourceRow}: '${rule.range}' aralığı tanımlanamadı.`
      );
      continue;
    }
    const compiled = { ...rule, matchedCount: 0 };
    compiledRules.push(compiled);
    const wrapped = (row, col) => {
      if (fn(row, col)) {
        compiled.matchedCount++;
        return true;
      }
      return false;
    };
    if (rule.sheet === '*') {
      wildcards.push(wrapped);
    } else {
      if (!matchers.has(rule.sheet)) matchers.set(rule.sheet, []);
      matchers.get(rule.sheet).push(wrapped);
    }
  }
  return { matchers, wildcards, compiledRules, parseErrors };
}

// Bir sheet için, kuralları birleştirip tek bir (row, col) → bool fn döner.
export function getSheetRedactor(compiled, sheetName) {
  const list = compiled.matchers.get(sheetName) ?? [];
  const all = [...list, ...compiled.wildcards];
  if (all.length === 0) return () => false;
  return (row, col) => {
    let hit = false;
    // Bütün matcher'ları dolaş ki matchedCount doğru sayılsın.
    for (const m of all) if (m(row, col)) hit = true;
    return hit;
  };
}

// Bir worksheet'in tüm formül hücrelerini toplar.
// isRedacted opsiyonel; verilirse her hücre için (row, col) → bool çağrılır
// ve sonuç `redacted` alanı olarak hücreye yazılır.
// Dönüş: [{ addr, row(1-idx), col(0-idx), colLetter, f, v, t, redacted }]
export function collectFormulas(ws, isRedacted) {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const out = [];
  const check = typeof isRedacted === 'function' ? isRedacted : null;
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
        redacted: check ? check(r, c) : false,
      });
    }
  }
  return out;
}
