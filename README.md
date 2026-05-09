# Excel Denetim Raporu Üreticisi

`.xlsx` ve `.xlsm` dosyalarını tarayıcıda işleyip LLM ile denetim için yapılandırılmış bir Markdown raporu üretir. **Dosya hiçbir sunucuya gönderilmez.**

## Çalıştırma

ES modülleri kullanıldığı için `index.html` dosyasını doğrudan çift tıklayarak (`file://`) açmak çalışmaz. Yerel bir HTTP sunucusu çalıştırın:

```bash
cd XL-LLM-TOOL
python -m http.server 8000
```

Ardından tarayıcıda `http://localhost:8000/` adresini açın.

Alternatif: VSCode "Live Server" eklentisi veya `npx serve`.

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
│   ├── parse.js     # SheetJS workbook + sheet metadata
│   └── markdown.js  # Markdown rapor montajı
└── README.md
```

## Sürüm Günlüğü

- **M1 — İskelet + dosya yükleme:** Drag-drop, SheetJS yükleme, sheet listesi.
- **M2 — Düz formül listesi:** Sheet başına `Hücre | Formül | Tip | Değer` tablosu, async yield ile UI bloklamadan ilerleme.
- M3–M5 (yakında): patern motoru, tutarsızlık, named ranges/external links/gizli sayfalar.
- M6 (sonra): VBA makro çıkarma (MS-OVBA dekompresyonu).
