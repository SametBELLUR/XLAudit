# Excel Denetim Raporu Üreticisi

`.xlsx` ve `.xlsm` dosyalarını tarayıcıda işleyip LLM ile denetim için yapılandırılmış bir Markdown raporu üretir. **Dosya hiçbir sunucuya gönderilmez.**

> **Lisans:** Bu proje [**PolyForm Noncommercial 1.0.0**](LICENSE) altında yayımlanmıştır. Kişisel, eğitsel, araştırma ve kâr amacı gütmeyen kuruluşlar için kullanım serbesttir; **ticari kullanım yasaktır**. Ticari lisans için yazara başvurun. (`SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0`)

## Çalıştırma

`index.html` dosyasını doğrudan tarayıcıda açın — çift tıklamak yeterli (`file://` desteklenir, build adımı veya yerel sunucu gerekmez).

GitHub Pages veya `python -m http.server 8000` ile de çalışır; sadece tarayıcıda CDN'den SheetJS çekebilmek için internet bağlantısı yeterli.

### Standalone tek-dosya sürümü

`.js` dosyalarına izin vermeyen ortak ağ sürücüleri (FSRM "Executable Files" kuralı vb.) için **tek dosyalık (CSS+JS inline) sürüm**: uygulamayı normal şekilde açın, sayfanın altındaki **"⬇ Tek-dosya (standalone) sürümünü indir"** butonuna basın — anlık olarak güncel kaynaktan üretilip `index.html` adıyla indirilir.

İndirilen dosya tek başına çalışır, klasör yapısına ihtiyacı yok. Repoda hazır bir bundle tutulmaz; daima en son koddan üretilir, sync drift olmaz.

## Kullanım

1. `.xlsx` veya `.xlsm` dosyanızı dropzone'a sürükleyin (veya "dosya seçin").
2. **Analiz Et** butonuna basın.
3. **Hassas veri triajı:** raporda görünecek benzersiz değerler 3 sekmeli (Metin / Sayısal / Ondalıklı) bir grid'de gelir; gizlemek istediklerinizi tek tek ya da "Hepsini Seç" ile işaretleyin → **Bitti**.
4. Üretilen Markdown'ı **Panoya Kopyala** veya **Markdown'ı İndir** ile alın, LLM'inize yapıştırın.
5. Tek bir sheet ve onun çapraz referans verdiği sheet'leri içeren odaklı bir alt-küme almak için: result alanındaki **Alt küme** seçicisinden sheet'i seçip **Sheet+bağlıları indir**.

## Bağımlılıklar

`index.html` CDN'den tek dosya çeker:

- [SheetJS](https://sheetjs.com/) `xlsx@0.20.3` (Excel parse + CFB)

İnternet bağlantısı yoksa CDN scripti `cdn.jsdelivr.net` fallback'ine düşer.

## Mimari

Tek sayfa, vanilla JS. Build adımı yok, npm yok. Modüller klasik `<script>` tag'leriyle bağımlılık sırasına göre yüklenir; her modül `window.EA.<modul>` namespace'ine yazar (IIFE) — `file://` üzerinden çift tıkla açma çalışsın diye.

```
.
├── LICENSE          # PolyForm Noncommercial 1.0.0
├── README.md
├── index.html       # HTML iskelet, CDN script, modül yükleme sırası
├── css/styles.css   # Sade CSS (sistem font, max-width 900px)
└── js/
    ├── parse.js     # SheetJS workbook + sheet metadata + formül toplama
    ├── patterns.js  # Tokenizer + patternize + groupByPattern + compactRanges
    ├── analysis.js  # Tutarsızlık + sabitler + sayfa-arası ref + alt-küme yardımcıları
    ├── triage.js    # Hassas veri triaj modali (sekmeli grid)
    ├── markdown.js  # Markdown rapor montajı (full + alt-küme)
    └── main.js      # DOM olayları + pipeline + standalone bundle indirme
```

## Sürüm Günlüğü

- **M1 — İskelet + dosya yükleme:** Drag-drop, SheetJS yükleme, sheet listesi.
- **M2 — Düz formül listesi:** Sheet başına `Hücre | Formül | Tip | Değer` tablosu, async yield ile UI bloklamadan ilerleme.
- **M3 — Patern motoru:** Tek-pas regex tokenizer, anchor-bazlı patern üretimi (`B{row}*1.18`), sütun-bazlı range compaction (`C2:C100`). Sheet başına patern özeti.
- **M4 — Tutarsızlık + sabitler + cross-sheet:** Sütun bazında çoğunluk patern tespiti (eşik %80), sapma/karışık etiketleme, hardcoded sayısal sabit ve sayfa-arası referans tabloları, tek-seferlik formül listesi.
- **M5 — Named ranges, external links, gizli sayfalar:** Workbook meta toplulaştırması ve genel rapor şekli.
- **Hassas veri triajı:** sekmeli (Metin/Sayısal/Ondalıklı) grid + filtre + toplu seçim; işaretlenenler raporda `***`.
- **Sheet alt-kümesi:** seçilen sheet ve doğrudan referans verdiği sheet'leri içeren odaklı, kısa Markdown indirme.
- **Standalone bundle butonu:** kaynaktan canlı CSS+JS inline tek-dosya `index.html` üretir; repoda generated dosya tutulmuyor.
- **PolyForm Noncommercial 1.0.0 lisansı:** ticari kullanım yasak; tüm kaynak dosyalarda SPDX header.
- M6 (sonra): VBA makro çıkarma (MS-OVBA dekompresyonu).
