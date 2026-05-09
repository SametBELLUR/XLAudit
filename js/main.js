// Giriş noktası: DOM olayları + analiz pipeline orkestrasyonu.
// IIFE — global namespace'e ihtiyacı yok, sadece DOM'a bağlanıyor.

(function () {
  const { readWorkbook, collectSheetMeta, collectFormulas, collectNamedRanges } = window.EA.parse;
  const { groupByPattern } = window.EA.patterns;
  const {
    findInconsistencies,
    aggregateConstants,
    aggregateCrossSheetRefs,
    aggregateExternalLinks,
    findOneOffFormulas,
    collectInconsistencyOutlierAddrs,
  } = window.EA.analysis;
  const { buildReport } = window.EA.markdown;
  const { collectCandidates, runTriage } = window.EA.triage;

  const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

  const ACCEPTED_EXTS = ['.xlsx', '.xlsm'];
  const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50 MB

  const els = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('file-input'),
    fileInfo: document.getElementById('file-info'),
    analyzeBtn: document.getElementById('analyze-btn'),
    status: document.getElementById('status-line'),
    errorBox: document.getElementById('error-box'),
    errorMsg: document.getElementById('error-msg'),
    errorDetail: document.getElementById('error-detail'),
    resultBox: document.getElementById('result-box'),
    resultOutput: document.getElementById('result-output'),
    copyBtn: document.getElementById('copy-btn'),
    downloadBtn: document.getElementById('download-btn'),
  };

  let currentFile = null;
  let currentMarkdown = '';

  function setStatus(msg) {
    els.status.textContent = msg ?? '';
  }

  function showError(msg, detail) {
    els.errorBox.hidden = false;
    els.errorMsg.textContent = msg;
    els.errorDetail.textContent = detail ?? '';
    console.error('[ExcelAudit]', msg, detail);
  }

  function clearError() {
    els.errorBox.hidden = true;
    els.errorMsg.textContent = '';
    els.errorDetail.textContent = '';
  }

  function isAcceptedFile(file) {
    if (!file) return false;
    const name = file.name.toLowerCase();
    return ACCEPTED_EXTS.some((ext) => name.endsWith(ext));
  }

  function fileType(file) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xlsm')) return '.xlsm';
    if (lower.endsWith('.xlsx')) return '.xlsx';
    return 'bilinmiyor';
  }

  function setCurrentFile(file) {
    if (!isAcceptedFile(file)) {
      showError(
        'Bu dosya tipi desteklenmiyor.',
        `Beklenen: ${ACCEPTED_EXTS.join(', ')}\nVerilen: ${file?.name ?? '(yok)'}`
      );
      currentFile = null;
      els.fileInfo.hidden = true;
      els.analyzeBtn.disabled = true;
      return;
    }
    clearError();
    currentFile = file;
    els.fileInfo.hidden = false;
    els.fileInfo.textContent = `${file.name} — ${(file.size / 1024).toFixed(1)} KB`;
    els.analyzeBtn.disabled = false;
    setStatus('Hazır. "Analiz Et" butonuna basın.');
    if (file.size > LARGE_FILE_THRESHOLD) {
      setStatus(
        `Dosya büyük (${(file.size / 1024 / 1024).toFixed(1)} MB). Analiz birkaç saniye sürebilir.`
      );
    }
  }

  async function runAnalysis() {
    if (!currentFile) return;
    clearError();
    els.resultBox.hidden = true;
    els.analyzeBtn.disabled = true;
    setStatus('Dosya okunuyor…');

    try {
      const buf = await currentFile.arrayBuffer();
      setStatus('Workbook ayrıştırılıyor…');
      const wbResult = await readWorkbook(buf);
      if (!wbResult.ok) {
        showError('Workbook ayrıştırılamadı.', wbResult.error);
        return;
      }
      const wb = wbResult.data;

      setStatus(`Sheet metadata toplanıyor (${wb.SheetNames.length} sheet)…`);
      const sheets = collectSheetMeta(wb);

      for (let i = 0; i < sheets.length; i++) {
        const s = sheets[i];
        setStatus(`Sheet ${i + 1}/${sheets.length} analiz ediliyor: "${s.name}"…`);
        await yieldToUI();
        const ws = wb.Sheets[s.name];
        s.formulas = collectFormulas(ws);
        s.patternGroups = groupByPattern(s.formulas);
        s.inconsistencies = findInconsistencies(s.formulas, s.patternGroups);
        s.constants = aggregateConstants(s.patternGroups);
        s.crossSheetRefs = aggregateCrossSheetRefs(s.patternGroups);
        const outlierAddrs = collectInconsistencyOutlierAddrs(s.inconsistencies);
        s.oneOffs = findOneOffFormulas(s.patternGroups, outlierAddrs);
        console.log(
          `[ExcelAudit] ${s.name}: ${s.formulas.length} formül, ${s.patternGroups.size} patern, ${s.inconsistencies.filter((c) => c.state !== 'tutarlı').length} tutarsız sütun`
        );
      }

      setStatus('Workbook seviyesinde meta toplanıyor…');
      await yieldToUI();
      const namedRanges = collectNamedRanges(wb);
      const externalLinks = aggregateExternalLinks(sheets);

      const candidates = collectCandidates(sheets);
      let sensitive = new Set();
      if (candidates.length > 0) {
        setStatus(
          `Hassas veri kontrolü: ${candidates.length} benzersiz değer triaj edilecek (← Hayır / → Evet, Esc: bitir)…`
        );
        await yieldToUI();
        sensitive = await runTriage(candidates);
        setStatus(`Triaj tamam — ${sensitive.size} değer hassas işaretlendi.`);
      }

      setStatus('Markdown raporu oluşturuluyor…');
      await yieldToUI();
      const md = buildReport({
        fileMeta: {
          fileName: currentFile.name,
          fileSize: currentFile.size,
          fileType: fileType(currentFile),
        },
        sheets,
        namedRanges,
        externalLinks,
        sensitive,
      });

      currentMarkdown = md;
      els.resultOutput.textContent = md;
      els.resultBox.hidden = false;
      setStatus(`Tamamlandı. ${sheets.length} sheet işlendi.`);
    } catch (err) {
      showError('Beklenmeyen hata oluştu.', err?.stack ?? String(err));
    } finally {
      els.analyzeBtn.disabled = !currentFile;
    }
  }

  function bindDropzone() {
    const dz = els.dropzone;

    ['dragenter', 'dragover'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add('dragover');
      })
    );

    ['dragleave', 'drop'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove('dragover');
      })
    );

    dz.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) setCurrentFile(file);
    });

    dz.addEventListener('click', (e) => {
      if (e.target.closest('label')) return;
      els.fileInput.click();
    });

    dz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        els.fileInput.click();
      }
    });
  }

  function bindButtons() {
    els.fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) setCurrentFile(file);
    });

    els.analyzeBtn.addEventListener('click', runAnalysis);

    els.copyBtn.addEventListener('click', async () => {
      if (!currentMarkdown) return;
      try {
        await navigator.clipboard.writeText(currentMarkdown);
        const old = els.copyBtn.textContent;
        els.copyBtn.textContent = 'Kopyalandı';
        setTimeout(() => (els.copyBtn.textContent = old), 1500);
      } catch (err) {
        showError('Panoya kopyalama başarısız.', String(err));
      }
    });

    els.downloadBtn.addEventListener('click', () => {
      if (!currentMarkdown || !currentFile) return;
      const baseName = currentFile.name.replace(/\.(xlsx|xlsm)$/i, '');
      const fname = `${baseName}-denetim.md`;
      const blob = new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    const standaloneBtn = document.getElementById('download-standalone-btn');
    if (standaloneBtn) {
      standaloneBtn.addEventListener('click', () => downloadStandalone(standaloneBtn));
    }
  }

  // Mevcut sayfanın CSS+JS'sini inline edip tek dosyalık standalone
  // HTML üretir ve indirir. Multi-file modda fetch() ile kaynakları
  // çeker; zaten bundled modda DOM'dan okur.
  async function downloadStandalone(btn) {
    const origLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Hazırlanıyor…';
    try {
      const baseUrl = new URL('.', window.location.href).href;
      const pageRes = await fetch(window.location.href, { cache: 'no-store' });
      if (!pageRes.ok) throw new Error(`HTML alınamadı (${pageRes.status})`);
      let html = await pageRes.text();

      const isMultiFile = html.includes('href="css/styles.css"');

      if (isMultiFile) {
        const cssRes = await fetch(baseUrl + 'css/styles.css', { cache: 'no-store' });
        if (!cssRes.ok) throw new Error(`styles.css alınamadı (${cssRes.status})`);
        const css = await cssRes.text();

        const JS_ORDER = ['parse', 'patterns', 'analysis', 'triage', 'markdown', 'main'];
        const jsBlocks = [];
        for (const name of JS_ORDER) {
          const r = await fetch(`${baseUrl}js/${name}.js`, { cache: 'no-store' });
          if (!r.ok) throw new Error(`js/${name}.js alınamadı (${r.status})`);
          jsBlocks.push(`// === js/${name}.js ===\n${await r.text()}`);
        }

        // NOT: Bu fonksiyon standalone bundle'a inline edildiğinde
        // bu string'lerdeki literal kapanış etiketi HTML parser'ı
        // tarafından dış script bloğunun kapanışı olarak yorumlanır.
        // '<\/script>' yazımı JS runtime'ında aynı string'e eşittir
        // ama HTML parser tarafından kapanış olarak görülmez.
        const scriptRe = new RegExp(
          '  <script src="js/parse\\.js"><\\/script>\\s*\\n' +
            '\\s*<script src="js/patterns\\.js"><\\/script>\\s*\\n' +
            '\\s*<script src="js/analysis\\.js"><\\/script>\\s*\\n' +
            '\\s*<script src="js/triage\\.js"><\\/script>\\s*\\n' +
            '\\s*<script src="js/markdown\\.js"><\\/script>\\s*\\n' +
            '\\s*<script src="js/main\\.js"><\\/script>'
        );

        html = html
          .replace(
            '<link rel="stylesheet" href="css/styles.css">',
            () => `<style>\n${css}\n<\/style>`
          )
          .replace(scriptRe, () => `  <script>\n${jsBlocks.join('\n\n')}\n  <\/script>`);
      }

      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'excel-audit-standalone.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      btn.textContent = '✓ İndirildi';
      setTimeout(() => (btn.textContent = origLabel), 1800);
    } catch (err) {
      console.error('[ExcelAudit] standalone üretimi başarısız:', err);
      btn.textContent = '✗ Hata: ' + (err.message || err);
      setTimeout(() => (btn.textContent = origLabel), 3500);
    } finally {
      btn.disabled = false;
    }
  }

  function init() {
    bindDropzone();
    bindButtons();
    setStatus('Bir Excel dosyası yükleyin.');
    console.log('[ExcelAudit] Hazır.');
  }

  init();
})();
