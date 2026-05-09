// Formül tokenizer, patternize, gruplama ve range compaction.
// IIFE + global namespace (window.EA.patterns).

window.EA = window.EA || {};
window.EA.patterns = (function () {
  const MAX_FORMULA_LEN = 8000;

  // Tek-pas tokenizer regex. Sıra önemli — STRING, EXT_REF, SHEET_REF
  // CELL'den önce eşleşmeli ki "A1" string'i veya [file]Sheet!A1 doğru ayrılsın.
  //
  // Capture grupları:
  //   1: STRING        "..."
  //   2: EXT_REF       [...]
  //   3: SHEET_REF_Q   '...'!
  //   4: SHEET_REF     Name!
  //   5: CELL whole    $?[A-Z]+$?\d+
  //   6: CELL absCol $
  //   7: CELL col letters
  //   8: CELL absRow $
  //   9: CELL row digits
  //  10: FUNC          ident öncesinde lookahead (
  //  11: NAME          bare identifier
  //  12: NUMBER        sayısal sabit
  //  13: OP            operatörler ve ayraçlar
  //  14: WS            boşluk
  const TOKEN_RE = /("(?:[^"]|"")*")|(\[[^\]]+\])|('(?:[^']|'')*'!)|([A-Za-z_][A-Za-z0-9_.]*!)|((\$?)([A-Z]+)(\$?)(\d+))|([A-Za-z_][A-Za-z0-9_.]*)(?=\s*\()|([A-Za-z_][A-Za-z0-9_.]*)|(-?\d+(?:\.\d+)?(?:[eE]-?\d+)?%?)|(<>|<=|>=|[-+*/^&=<>,;:(){}])|(\s+)/g;

  function classifyMatch(m) {
    if (m[1] !== undefined) return { type: 'STRING', text: m[1] };
    if (m[2] !== undefined) return { type: 'EXT_REF', text: m[2] };
    if (m[3] !== undefined) return { type: 'SHEET_REF', text: m[3] };
    if (m[4] !== undefined) return { type: 'SHEET_REF', text: m[4] };
    if (m[5] !== undefined) {
      return {
        type: 'CELL',
        text: m[5],
        absCol: m[6] === '$',
        col: m[7],
        absRow: m[8] === '$',
        row: m[9],
      };
    }
    if (m[10] !== undefined) return { type: 'FUNC', text: m[10] };
    if (m[11] !== undefined) return { type: 'NAME', text: m[11] };
    if (m[12] !== undefined) return { type: 'NUMBER', text: m[12] };
    if (m[13] !== undefined) return { type: 'OP', text: m[13] };
    if (m[14] !== undefined) return { type: 'WS', text: m[14] };
    return { type: 'UNK', text: m[0] };
  }

  function tokenizeFormula(src) {
    if (src == null) return [];
    let s = String(src);
    if (s.length > MAX_FORMULA_LEN) {
      return [{ type: 'RAW', text: s }];
    }
    if (s.startsWith('=')) s = s.slice(1);

    const tokens = [];
    let pos = 0;
    while (pos < s.length) {
      TOKEN_RE.lastIndex = pos;
      const m = TOKEN_RE.exec(s);
      if (!m || m.index !== pos) {
        tokens.push({ type: 'UNK', text: s[pos] });
        pos++;
        continue;
      }
      tokens.push(classifyMatch(m));
      pos = TOKEN_RE.lastIndex;
    }
    return tokens;
  }

  function colLettersToNum(letters) {
    let n = 0;
    for (let i = 0; i < letters.length; i++) {
      n = n * 26 + (letters.charCodeAt(i) - 64);
    }
    return n;
  }

  // CELL token'ı, kendi anchor (formülün bulunduğu hücre) referansı ile
  // patern parçasına çevirir. Sütun harfi her zaman literal kalır.
  function formatCellPattern(cell, anchor) {
    const colPart = (cell.absCol ? '$' : '') + cell.col;
    let rowPart;
    if (cell.absRow) {
      rowPart = '$' + cell.row;
    } else {
      const rowNum = parseInt(cell.row, 10);
      const offset = rowNum - anchor.row;
      if (offset === 0) rowPart = '{row}';
      else if (offset > 0) rowPart = `{row+${offset}}`;
      else rowPart = `{row${offset}}`;
    }
    return colPart + rowPart;
  }

  function patternize(tokens, anchor) {
    if (tokens.length === 1 && tokens[0].type === 'RAW') {
      return {
        pattern: '<UZUN FORMÜL>',
        numericConstants: [],
        sheetRefs: [],
        extRefs: [],
        hasRelativeRow: false,
      };
    }
    const parts = ['='];
    const numericConstants = [];
    const sheetRefs = [];
    const extRefs = [];
    let hasRelativeRow = false;

    for (const t of tokens) {
      switch (t.type) {
        case 'CELL':
          if (!t.absRow) hasRelativeRow = true;
          parts.push(formatCellPattern(t, anchor));
          break;
        case 'NUMBER':
          numericConstants.push(t.text);
          parts.push(t.text);
          break;
        case 'SHEET_REF':
          sheetRefs.push(t.text);
          parts.push(t.text);
          break;
        case 'EXT_REF':
          extRefs.push(t.text);
          parts.push(t.text);
          break;
        default:
          parts.push(t.text);
      }
    }

    return {
      pattern: parts.join(''),
      numericConstants,
      sheetRefs,
      extRefs,
      hasRelativeRow,
    };
  }

  function groupByPattern(formulas) {
    const groups = new Map();
    for (const f of formulas) {
      const tokens = tokenizeFormula(f.f);
      const info = patternize(tokens, { row: f.row, col: f.col });
      let g = groups.get(info.pattern);
      if (!g) {
        g = {
          pattern: info.pattern,
          cells: [],
          numericConstants: new Set(),
          sheetRefs: new Set(),
          extRefs: new Set(),
          hasRelativeRow: info.hasRelativeRow,
          sample: f,
        };
        groups.set(info.pattern, g);
      }
      g.cells.push(f);
      info.numericConstants.forEach((n) => g.numericConstants.add(n));
      info.sheetRefs.forEach((s) => g.sheetRefs.add(s));
      info.extRefs.forEach((e) => g.extRefs.add(e));
    }
    for (const g of groups.values()) {
      g.numericConstants = [...g.numericConstants];
      g.sheetRefs = [...g.sheetRefs];
      g.extRefs = [...g.extRefs];
    }
    return groups;
  }

  // Aynı sütundaki ardışık satırları aralık olarak sıkıştırır.
  function compactRanges(cells) {
    if (cells.length === 0) return [];
    const sorted = [...cells].sort((a, b) => a.col - b.col || a.row - b.row);
    const runs = [];
    let cur = {
      col: sorted[0].col,
      colLetter: sorted[0].colLetter,
      startRow: sorted[0].row,
      endRow: sorted[0].row,
    };
    for (let i = 1; i < sorted.length; i++) {
      const c = sorted[i];
      if (c.col === cur.col && c.row === cur.endRow + 1) {
        cur.endRow = c.row;
      } else {
        runs.push(cur);
        cur = { col: c.col, colLetter: c.colLetter, startRow: c.row, endRow: c.row };
      }
    }
    runs.push(cur);
    return runs.map((r) =>
      r.startRow === r.endRow
        ? `${r.colLetter}${r.startRow}`
        : `${r.colLetter}${r.startRow}:${r.colLetter}${r.endRow}`
    );
  }

  return {
    tokenizeFormula,
    patternize,
    groupByPattern,
    compactRanges,
    __test__: { TOKEN_RE, colLettersToNum, formatCellPattern },
  };
})();
