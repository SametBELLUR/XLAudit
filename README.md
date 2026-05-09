# Excel Denetim Raporu Üreticisi

`.xlsx` ve `.xlsm` dosyalarını tarayıcıda işleyip LLM ile denetim için yapılandırılmış bir Markdown raporu üretir. **Dosya hiçbir sunucuya gönderilmez.**

## Çalıştırma

`index.html` dosyasını doğrudan tarayıcıda açın — çift tıklamak yeterli (`file://` desteklenir, build adımı veya yerel sunucu gerekmez).

GitHub Pages veya `python -m http.server 8000` ile de çalışır; sadece tarayıcıda CDN'den SheetJS çekebilmek için internet bağlantısı yeterli.

### Standalone tek-dosya sürümü

`.js` dosyalarına izin vermeyen ortak ağ sürücüleri (FSRM "Executable Files" kuralı vb.) için **tek dosyalık (CSS+JS inline) sürüm**: uygulamayı normal şekilde açın, sayfanın altındaki **"⬇ Tek-dosya (standalone) sürümünü indir"** butonuna basın — anlık olarak güncel kaynaktan üretilip indirilir (`excel-audit-standalone.html`).

İndirilen dosya tek başına çalışır, klasör yapısına ihtiyacı yok. Repoda hazır `standalone/` dosyası tutulmaz; daima en son koddan üretilir, sync drift olmaz.

## Kullanım

1. `.xlsx` veya `.xlsm` dosyanızı dropzone'a sürükleyin (veya "dosya seçin").
2. **Analiz Et** butonuna basın.
3. Üretilen Markdown'ı **Panoya Kopyala** veya **Markdown'ı İndir** ile alın, LLM'inize yapıştırın.

## Bağımlılıklar

`index.html` CDN'den tek dosya çeker:

- [SheetJS](https://sheetjs.com/) `xlsx@0.20.3` (Excel parse + CFB)

İnternet bağlantısı yoksa CDN scripti `cdn.jsdelivr.net` fallback'ine düşer.

## Mimari

Tek sayfa, vanilla JS (ES modules). Build adımı yok, npm yok.

```
.
├── index.html       # HTML iskelet, CDN script, modül girişi
├── css/styles.css   # Sade CSS
├── js/
│   ├── main.js      # DOM olayları + pipeline orkestrasyonu
│   ├── parse.js     # SheetJS workbook + sheet metadata + formül toplama
│   ├── patterns.js  # Tokenizer + patternize + groupByPattern + compactRanges
│   ├── analysis.js  # Tutarsızlık + sabitler + sayfa-arası ref toplulaştırması
│   └── markdown.js  # Markdown rapor montajı
└── README.md
```

## Lisans

Bu proje **PolyForm Noncommercial 1.0.0** lisansı altında yayımlanmıştır (bkz. [`LICENSE`](LICENSE)). Kişisel, eğitsel, araştırma ve kâr amacı gütmeyen kuruluşlar için kullanım serbesttir; **ticari kullanım yasaktır**. Ticari lisans için yazara başvurun.

`SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0`

## Sürüm Günlüğü

- **M1 — İskelet + dosya yükleme:** Drag-drop, SheetJS yükleme, sheet listesi.
- **M2 — Düz formül listesi:** Sheet başına `Hücre | Formül | Tip | Değer` tablosu, async yield ile UI bloklamadan ilerleme.
- **M3 — Patern motoru:** Tek-pas regex tokenizer, anchor-bazlı patern üretimi (`B{row}*1.18`), sütun-bazlı range compaction (`C2:C100`). Sheet başına tablo formül sayısı yerine patern özeti gösterir.
- **M4 — Tutarsızlık + sabitler + cross-sheet:** Sütun bazında çoğunluk patern tespiti (eşik %80), sapma/karışık etiketleme, hardcoded sayısal sabit ve sayfa-arası referans tabloları, tek-seferlik formül listesi.
- **M5 — Named ranges, external links, gizli sayfalar:** Workbook meta toplulaştırması — Named Range tablosu (workbook/sheet kapsam), External Link tablosu (`[file.xlsx]` paterninden), Gizli Öğeler bölümü, Genel Özet'te toplulaştırılmış sayılar.
- M6 (sonra): VBA makro çıkarma (MS-OVBA dekompresyonu).
