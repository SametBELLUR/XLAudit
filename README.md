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
│   ├── parse.js     # SheetJS workbook + sheet metadata + formül toplama
│   ├── patterns.js  # Tokenizer + patternize + groupByPattern + compactRanges
│   ├── analysis.js  # Tutarsızlık + sabitler + sayfa-arası ref toplulaştırması
│   └── markdown.js  # Markdown rapor montajı
└── README.md
```

## Redaction (Hassas hücre maskeleme)

Excel dosyanıza `Excel_LLM_Config` adında bir sayfa eklerseniz, oradaki kurallara göre hücre **değerleri** raporda `***` ile maskelenir. Formül yapısı korunur.

### Config sayfası şeması

| Sheet | Aralık | Mod (opsiyonel) | Not (opsiyonel) |
|-------|--------|------------------|------------------|
| Müşteriler | A:A | hide_value | Ad sütunu |
| Müşteriler | C2:C100 | hide_value | İletişim |
| Sales | * | | Tüm sayfa |
| * | E:E | | E sütunu tüm sayfalarda |

- **Sheet:** hedef sayfa adı, ya da `*` (tüm sayfalar).
- **Aralık:** desteklenen biçimler — `A1`, `A1:B10`, `A:A`, `A:C`, `1:1`, `1:5`, `*` (tüm sayfa).
- **Mod:** şu an sadece `hide_value` (default). Hücrenin hesaplanmış değeri maskelenir, formül olduğu gibi kalır.
- **Not:** sadece informasyon; eşleştirmede kullanılmaz.

Kabul edilen başlık eşanlamlıları: `Sheet`/`Sayfa`, `Aralık`/`Aralik`/`Range`, `Mod`/`Mode`, `Not`/`Note`/`Açıklama`. Kabul edilen sayfa adı varyantları: `Excel_LLM_Config`, `_LLM_Config`, `LLM_Config` (case-insensitive).

### Davranış

- Eşleşen formül hücreleri için: formül raporda görünür, "Örnek Değer" ve "Tek Seferlik Formüller" değer sütunları `***` olur.
- Config sayfasının kendisi rapora ana sheet olarak alınmaz.
- Config bulunmazsa rapor normal çıkar (geriye dönük uyumlu).
- Parse hatası varsa "Redaction Politikası" bölümü altında uyarı listelenir — sessiz başarısızlık yok.
- Genel Özet'e satır eklenir: *"Redaction: `Excel_LLM_Config` algılandı, X kural, Y hücrenin değeri maskelendi"*.

## Sürüm Günlüğü

- **M1 — İskelet + dosya yükleme:** Drag-drop, SheetJS yükleme, sheet listesi.
- **M2 — Düz formül listesi:** Sheet başına `Hücre | Formül | Tip | Değer` tablosu, async yield ile UI bloklamadan ilerleme.
- **M3 — Patern motoru:** Tek-pas regex tokenizer, anchor-bazlı patern üretimi (`B{row}*1.18`), sütun-bazlı range compaction (`C2:C100`). Sheet başına tablo formül sayısı yerine patern özeti gösterir.
- **M4 — Tutarsızlık + sabitler + cross-sheet:** Sütun bazında çoğunluk patern tespiti (eşik %80), sapma/karışık etiketleme, hardcoded sayısal sabit ve sayfa-arası referans tabloları, tek-seferlik formül listesi.
- **M5 — Named ranges, external links, gizli sayfalar:** Workbook meta toplulaştırması — Named Range tablosu (workbook/sheet kapsam), External Link tablosu (`[file.xlsx]` paterninden), Gizli Öğeler bölümü, Genel Özet'te toplulaştırılmış sayılar.
- **M5.5 — Redaction:** `Excel_LLM_Config` sayfası ile hücre değerlerini maskeleme. Bkz. aşağıda "Redaction".
- M6 (sonra): VBA makro çıkarma (MS-OVBA dekompresyonu).
