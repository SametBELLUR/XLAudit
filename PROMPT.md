<!--
SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
Copyright (c) 2026 Samet Bellur
-->

# Excel Denetim Raporu — LLM Prompt Şablonu

Aşağıdaki Markdown raporu, **Excel Denetim Raporu Üreticisi** tarafından otomatik üretilmiş bir analizdir. Bu rapora bakarak iki adımlı bir analiz çıktısı oluşturmanı istiyorum.

## Yapısal notlar (rapor formatı)

- **"Şablonlar (Workbook Geneli)"** tablosu: workbook'un asıl iş kurallarının özüdür. Her satır bir formül "skeleton"udur (sayısal sabitler `{const}` olarak abstrakte edilmiş). "Sheet+Aralıklar" kolonu o şablonun hangi sheet'lerde, hangi hücre aralıklarında uygulandığını gösterir. "Sabit Dağılımı" kolonu o şablonun pozisyonel sayısal sabitlerini ve sıklığını verir; ⚠ işareti azınlık (outlier) sabit varlığını belirtir.
- Pattern içindeki `{row}` placeholder'ı: formülün bulunduğu hücrenin satır numarası. `{row+N}`, `{row-N}` ise göreli offset.
- `{const}` placeholder'ı: sayısal sabit (KDV oranı, çarpan, sabit eşik vb.).
- Sheet section'larındaki "Sabit Değerler", "Çapraz Sayfa Referansları" ve "Tek Seferlik Formüller" tabloları sheet bazlı detaylardır.
- "Named Ranges" tablosu workbook genelindeki mantıksal isimlendirmeleri (parametre tabloları, sabitler) listeler.

## İstediğim çıktı

### Bölüm 1 — Genel İş Kuralları

Raporu bir bütün olarak analiz et ve aşağıdaki başlıklarla **kısa bir yönetici özeti** yaz (toplam 200-400 kelime):

1. **Workbook'un genel amacı.** Bu dosya muhtemelen ne için kullanılıyor? (örn. "12 aylık KDV beyannamesi", "müşteri faturalama", "bütçe konsolidasyonu", "stok değerleme"). Sheet adlarından, "Şablonlar" tablosundaki dominant formül yapılarından ve named range'lerden çıkar.
2. **Baskın iş kuralları.** Şablonlar tablosundan en çok hücreyi kapsayan ilk 3-5 şablonu tek tek ele al, her birini insan diliyle açıkla:
   - Skeleton'u oku (`=B{row}*{const}` → "B sütunundaki değeri sabit bir oranla çarpıyor")
   - "Sabit Dağılımı"ndaki değerlere bak ve iş anlamlarını tahmin et (1.18 → KDV, 1.20 → güncellenmiş KDV oranı, 0.95 → indirim, 12 → ay sayısı, 365 → yıllık gün vs.)
   - Hangi sheet/aralıklarda uygulandığını söyle
3. **Workbook'un akışı.** Hangi sheet hangi sheet'in çıktılarına dayanıyor? Workbook için "girdi sheet'leri", "ara hesap sheet'leri" ve "özet/sonuç sheet'leri" sınıflaması yap (Çapraz Sayfa Referansları'na bak).
4. **Sabit değerler ve named range'ler.** Hardcoded sayıların ve named range'lerin iş bağlamı.
5. **Dikkat çeken anomaliler.**
   - Şablonlar tablosunda "Sabit Dağılımı" kolonunda ⚠ işareti olan satırlar — outlier sabitler (yanlış girilmiş KDV gibi)
   - "Tek Seferlik Formüller" bölümlerinde göze çarpan riskli formüller (örn. el ile yazılmış toplamlar, hardcoded değerler)
   - External Links varsa: dış dosya bağımlılığı riski

### Bölüm 2 — Sheet Bazlı Analiz

Her görünür sheet için ayrı bir alt başlık aç (gizli sheet'leri "Gizli Öğeler" tablosundan da görebilirsin; gerekiyorsa onlara da değin):

#### {Sheet Adı}

- **Görev:** Bu sheet ne yapıyor? 1-2 cümlede iş anlamı.
- **Önemli sahalar / sütunlar:** Hangi sütunlar veya hücre blokları kritik? Her biri için:
  - Hangi şablonu kullanıyor (Şablonlar tablosundan al, örn. `=B{row}*{const}` ile)
  - İş anlamı: "C sütunu KDV dahil tutarı hesaplıyor (B × 1.18)"
  - Hangi sheet'lerden veya named range'lerden veri çekiyor
- **Anomaliler / dikkat noktaları:**
  - Sapma sabitler (⚠ ile işaretli olanlar)
  - Tek-seferlik formüller içindeki manuel müdahaleler
  - Hardcoded değerler (named range yerine raw sayı kullanımı)
- **İyileştirme önerisi (varsa, kısa):** Yapısal bir sorun, basitleştirme ya da named range önerisi.

## Yazım kuralları

- **Türkçe** yaz, sade ve teknik olmayan dil kullan; iş kullanıcısına hitap ediyorsun.
- **Ham tabloyu tekrar yazma.** Tablodaki verileri yorumla, özümle.
- **Skeleton/placeholder'ları okuyucuya çevir:** `=B{row}*1.18` yerine "B sütunundaki değer × 1.18 (KDV oranı)" gibi.
- **Maskelenmiş değerler** (`***`) varsa, bunları gizli tut, "müşteri bilgisi maskelendi" diye geç.
- **Spekülasyondan kaçın:** "1.18 muhtemelen KDV oranıdır" gibi makul varsayımlar yap; ama hiçbir şekilde gerçek olmayan sayı veya iş kuralı uydurma.
- Belirsiz olduğun yerlerde "rapor bunu netleştirmiyor, kullanıcıya teyit ettir" notunu ekle.

---

## Rapor

[Buraya **Excel Denetim Raporu Üreticisi**'nin ürettiği Markdown çıktısını yapıştırın.]
