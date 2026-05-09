// Hassas veri triaj modülü — sekmeli grid sürümü.
// Üç tab: Metin, Sayısal (tam sayı), Ondalıklı (decimal).
// Her sekmede satır listesi: işaretle, satıra tıkla, "Hepsini Seç" /
// "Hepsini Kaldır" / filtre. Bitti'ye basınca Set<string> hassas
// değerlerle resolve.
//
// IIFE + global namespace (window.EA.triage).

window.EA = window.EA || {};
window.EA.triage = (function () {
  function fmtValue(v) {
    if (v == null) return '';
    if (typeof v === 'number') {
      if (!isFinite(v)) return String(v);
      return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, '');
    }
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  }

  function categorize(v) {
    if (typeof v === 'number' && isFinite(v)) {
      return Number.isInteger(v) ? 'int' : 'dec';
    }
    return 'text';
  }

  function collectCandidates(sheets) {
    const seen = new Map();
    function add(v, occurrence) {
      if (v == null) return;
      const display = fmtValue(v);
      if (display === '') return;
      if (!seen.has(display)) {
        seen.set(display, { display, category: categorize(v), occurrences: [] });
      }
      seen.get(display).occurrences.push(occurrence);
    }
    for (const s of sheets) {
      if (s.patternGroups) {
        for (const g of s.patternGroups.values()) {
          add(g.sample.v, { sheet: s.name, addr: g.sample.addr });
        }
      }
      if (s.oneOffs) {
        for (const o of s.oneOffs) {
          add(o.value, { sheet: s.name, addr: o.addr });
        }
      }
    }
    return [...seen.values()].sort(
      (a, b) => b.occurrences.length - a.occurrences.length
    );
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  const CAT_ORDER = ['text', 'int', 'dec'];
  const CAT_LABEL = { text: 'Metin', int: 'Sayısal', dec: 'Ondalıklı' };

  function runTriage(candidates) {
    return new Promise((resolve) => {
      if (!candidates || candidates.length === 0) {
        resolve(new Set());
        return;
      }

      const buckets = { text: [], int: [], dec: [] };
      for (const c of candidates) buckets[c.category].push(c);

      const overlay = document.getElementById('triage-overlay');
      const tabsWrap = document.getElementById('triage-tabs');
      const gridBody = document.getElementById('triage-grid-body');
      const masterCheck = document.getElementById('triage-master-check');
      const selectAllBtn = document.getElementById('triage-select-all');
      const clearAllBtn = document.getElementById('triage-clear-all');
      const filterInput = document.getElementById('triage-filter');
      const commitBtn = document.getElementById('triage-commit');
      const cancelBtn = document.getElementById('triage-cancel');
      const commitCountEl = document.getElementById('triage-commit-count');
      const progressEl = document.getElementById('triage-progress');

      const sensitive = new Set();
      let activeCat = null;

      function visibleItems() {
        const items = buckets[activeCat] || [];
        const f = filterInput.value.trim().toLowerCase();
        if (!f) return items;
        return items.filter((c) => c.display.toLowerCase().includes(f));
      }

      function renderTabs() {
        tabsWrap.innerHTML = '';
        for (const cat of CAT_ORDER) {
          const total = buckets[cat].length;
          const sel = buckets[cat].filter((c) => sensitive.has(c.display)).length;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'triage-tab';
          btn.dataset.cat = cat;
          btn.disabled = total === 0;
          if (cat === activeCat) btn.classList.add('active');
          btn.innerHTML = `${CAT_LABEL[cat]} <span class="tab-count">${sel}/${total}</span>`;
          tabsWrap.appendChild(btn);
        }
      }

      function renderGrid() {
        const visible = visibleItems();
        gridBody.innerHTML = '';
        if (visible.length === 0) {
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td colspan="4" class="grid-empty">' +
            (filterInput.value ? '(filtreyle eşleşen değer yok)' : '(bu kategoride değer yok)') +
            '</td>';
          gridBody.appendChild(tr);
          syncMaster();
          return;
        }
        const frag = document.createDocumentFragment();
        for (const c of visible) {
          const tr = document.createElement('tr');
          tr.dataset.value = c.display;
          const isOn = sensitive.has(c.display);
          if (isOn) tr.classList.add('selected');
          const occ = c.occurrences.length;
          const first = c.occurrences[0];
          const moreText = occ > 1 ? ` <span class="grid-more">(+${occ - 1})</span>` : '';
          tr.innerHTML = `
            <td class="col-check"><input type="checkbox" ${isOn ? 'checked' : ''} tabindex="-1" aria-label="Hassas işaretle"></td>
            <td class="col-value">${escapeHtml(c.display)}</td>
            <td class="col-loc"><code>${escapeHtml(first.sheet)}!${escapeHtml(first.addr)}</code>${moreText}</td>
            <td class="col-count">${occ}</td>
          `;
          frag.appendChild(tr);
        }
        gridBody.appendChild(frag);
        syncMaster();
      }

      function syncMaster() {
        const visible = visibleItems();
        if (visible.length === 0) {
          masterCheck.checked = false;
          masterCheck.indeterminate = false;
          masterCheck.disabled = true;
          return;
        }
        masterCheck.disabled = false;
        const sel = visible.filter((c) => sensitive.has(c.display)).length;
        if (sel === 0) {
          masterCheck.checked = false;
          masterCheck.indeterminate = false;
        } else if (sel === visible.length) {
          masterCheck.checked = true;
          masterCheck.indeterminate = false;
        } else {
          masterCheck.checked = false;
          masterCheck.indeterminate = true;
        }
      }

      function updateCounts() {
        commitCountEl.textContent = String(sensitive.size);
        progressEl.textContent = `${sensitive.size} / ${candidates.length} hassas`;
      }

      function setActive(cat) {
        if (buckets[cat].length === 0) {
          for (const c of CAT_ORDER) if (buckets[c].length > 0) { cat = c; break; }
        }
        activeCat = cat;
        filterInput.value = '';
        renderTabs();
        renderGrid();
      }

      function toggle(value) {
        if (sensitive.has(value)) sensitive.delete(value);
        else sensitive.add(value);
        const tr = gridBody.querySelector(`tr[data-value="${CSS.escape(value)}"]`);
        if (tr) {
          const isOn = sensitive.has(value);
          tr.classList.toggle('selected', isOn);
          const cb = tr.querySelector('input[type="checkbox"]');
          if (cb) cb.checked = isOn;
        }
        updateCounts();
        renderTabs();
        syncMaster();
      }

      function setAllVisible(state) {
        const visible = visibleItems();
        for (const c of visible) {
          if (state) sensitive.add(c.display);
          else sensitive.delete(c.display);
        }
        updateCounts();
        renderTabs();
        renderGrid();
      }

      function onTabsClick(e) {
        const btn = e.target.closest('.triage-tab');
        if (!btn || btn.disabled) return;
        setActive(btn.dataset.cat);
      }

      function onGridClick(e) {
        const tr = e.target.closest('tr[data-value]');
        if (!tr) return;
        toggle(tr.dataset.value);
      }

      function onMasterChange() {
        setAllVisible(masterCheck.checked);
      }

      function onSelectAll() { setAllVisible(true); }
      function onClearAll() { setAllVisible(false); }
      function onFilter() { renderGrid(); }
      function onCommit() {
        cleanup();
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        resolve(sensitive);
      }
      function onCancel() {
        cleanup();
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        resolve(new Set());
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onCommit(); }
      }

      function cleanup() {
        tabsWrap.removeEventListener('click', onTabsClick);
        gridBody.removeEventListener('click', onGridClick);
        masterCheck.removeEventListener('change', onMasterChange);
        selectAllBtn.removeEventListener('click', onSelectAll);
        clearAllBtn.removeEventListener('click', onClearAll);
        filterInput.removeEventListener('input', onFilter);
        commitBtn.removeEventListener('click', onCommit);
        cancelBtn.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
      }

      tabsWrap.addEventListener('click', onTabsClick);
      gridBody.addEventListener('click', onGridClick);
      masterCheck.addEventListener('change', onMasterChange);
      selectAllBtn.addEventListener('click', onSelectAll);
      clearAllBtn.addEventListener('click', onClearAll);
      filterInput.addEventListener('input', onFilter);
      commitBtn.addEventListener('click', onCommit);
      cancelBtn.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);

      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');

      // En çok değer içeren tab açık başlasın.
      const initial = [...CAT_ORDER].sort((a, b) => buckets[b].length - buckets[a].length)[0];
      setActive(initial);
      updateCounts();
    });
  }

  return { collectCandidates, runTriage };
})();
