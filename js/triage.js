// Hassas veri triaj modülü.
// Sheet'lerden toplanan benzersiz değerleri kullanıcıya tek tek
// gösterir; HAYIR (gizleme) / EVET (gizle, hassas) butonları veya
// klavye Sol/Sağ ok tuşlarıyla karar alınır. Tinder-vari swipe
// animasyonu ile bir sonraki kart gelir.
//
// IIFE + global namespace (window.EA.triage).

window.EA = window.EA || {};
window.EA.triage = (function () {
  const MAX_DISPLAY_LEN = 200;

  function fmtValue(v) {
    if (v == null) return '';
    if (typeof v === 'number') {
      if (!isFinite(v)) return String(v);
      return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, '');
    }
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  }

  // Sheet'lerden raporda görüntülenecek benzersiz değerleri toplar.
  // Şu an sample'lanan iki yeri kapsar: pattern table örnek değer ve
  // tek-seferlik formül değeri.
  function collectCandidates(sheets) {
    const seen = new Map();
    function add(v, occurrence) {
      if (v == null) return;
      const display = fmtValue(v);
      if (display === '') return;
      if (!seen.has(display)) {
        seen.set(display, { display, occurrences: [] });
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
    // Görünüm sırası: en çok hücrede görülen → en az.
    return [...seen.values()].sort(
      (a, b) => b.occurrences.length - a.occurrences.length
    );
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  function truncate(s, n) {
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + '…';
  }

  function buildCardEl(item, idx, total) {
    const card = document.createElement('div');
    card.className = 'triage-card';
    const occ = item.occurrences.length;
    const first = item.occurrences[0];
    const moreText = occ > 1 ? ` <span class="triage-card-more">(+${occ - 1} daha)</span>` : '';
    card.innerHTML = `
      <div class="triage-card-value">${escapeHtml(truncate(item.display, MAX_DISPLAY_LEN))}</div>
      <div class="triage-card-context">
        ${occ} hücrede · İlk: <code>${escapeHtml(first.sheet)}!${escapeHtml(first.addr)}</code>${moreText}
      </div>
    `;
    return card;
  }

  // Promise<Set<string>> — kullanıcının hassas işaretlediği display'ler.
  function runTriage(candidates) {
    return new Promise((resolve) => {
      if (!candidates || candidates.length === 0) {
        resolve(new Set());
        return;
      }

      const overlay = document.getElementById('triage-overlay');
      const stack = document.getElementById('triage-stack');
      const noBtn = document.getElementById('triage-no');
      const yesBtn = document.getElementById('triage-yes');
      const skipBtn = document.getElementById('triage-skip-all');
      const progressEl = document.getElementById('triage-progress');

      let idx = 0;
      const total = candidates.length;
      const sensitive = new Set();
      let busy = false;

      function updateProgress() {
        progressEl.textContent = `${Math.min(idx + 1, total)} / ${total}`;
      }

      function showCurrent() {
        if (idx >= total) {
          finish();
          return;
        }
        updateProgress();
        stack.innerHTML = '';
        const card = buildCardEl(candidates[idx], idx, total);
        // Yeni kart aşağıdan/saydam halde girer.
        card.classList.add('enter');
        stack.appendChild(card);
        // Reflow zorla, sonra enter class'ını kaldır → transition.
        // requestAnimationFrame ile yumuşak ilerletme.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => card.classList.remove('enter'));
        });
        busy = false;
      }

      function decide(isSensitive) {
        if (busy || idx >= total) return;
        busy = true;
        const card = stack.querySelector('.triage-card');
        const item = candidates[idx];
        if (isSensitive) sensitive.add(item.display);
        if (!card) {
          idx++;
          showCurrent();
          return;
        }
        card.classList.add(isSensitive ? 'swipe-right' : 'swipe-left');
        const onEnd = () => {
          card.removeEventListener('transitionend', onEnd);
          idx++;
          showCurrent();
        };
        card.addEventListener('transitionend', onEnd);
        // Güvenlik: transitionend tetiklenmezse 500ms sonra zorla ilerle.
        setTimeout(() => {
          if (busy) {
            card.removeEventListener('transitionend', onEnd);
            idx++;
            showCurrent();
          }
        }, 500);
      }

      function finish() {
        cleanup();
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        resolve(sensitive);
      }

      function skipAll() {
        idx = total;
        finish();
      }

      function onKey(e) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          decide(false);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          decide(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          skipAll();
        }
      }

      function onNo() { decide(false); }
      function onYes() { decide(true); }

      function cleanup() {
        noBtn.removeEventListener('click', onNo);
        yesBtn.removeEventListener('click', onYes);
        skipBtn.removeEventListener('click', skipAll);
        document.removeEventListener('keydown', onKey);
      }

      noBtn.addEventListener('click', onNo);
      yesBtn.addEventListener('click', onYes);
      skipBtn.addEventListener('click', skipAll);
      document.addEventListener('keydown', onKey);

      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      showCurrent();
    });
  }

  return { collectCandidates, runTriage };
})();
