<!--
SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
Copyright (c) 2026 Samet Bellur
-->

**🇹🇷 Türkçe** · [🇬🇧 English](HOW_IT_WORKS.en.md)

---

# Bu araç nasıl çalışıyor?

Teknik olmayan bir okuyucu için kısa anlatım. Excel dosyanız neden tarayıcıdan çıkmıyor, "skeleton" ne demek, bir KDV hatası tek bakışta nasıl ortaya çıkıyor — hepsi burada.

## 1. Hiç sunucu yok

Excel dosyanız tarayıcınızdan **dışarı çıkmıyor**. JavaScript kodu (SheetJS kütüphanesi) tarayıcının kendi içinde dosyayı açıyor, hücre hücre okuyor. Tüm analiz CPU'nuzda olup bitiyor; rapor üretildikten sonra kopyalayıp LLM'e siz gönderiyorsunuz.

## 2. Excel'i nasıl okuyor

Bir `.xlsx` dosyası aslında bir ZIP arşivi — içindeki XML'lerde her sheet, her hücre ve her formül var. SheetJS bunları parse edip bize şu bilgiyi veriyor:

- **Hücre adresi** (`B2`, `D5` gibi)
- **Formül** (varsa, `=A1*1.18` gibi)
- **Hesaplanmış değer** (Excel'in sakladığı son sonuç, `118` gibi)
- **Sheet meta** (adı, gizli mi, kullanılan aralık)

Sonra biz sadece **formüllü** hücrelerle ilgileniyoruz — boş hücreler ve düz değerler (müşteri adı vb.) raporda yer almıyor.

## 3. Skeleton (formül parmak izi) — en kritik fikir

Düşünün ki C sütununda KDV hesabı var:

```
C2:   =B2*1.18
C3:   =B3*1.18
C4:   =B4*1.18
...
C100: =B100*1.18
```

99 farklı formül var ama hepsi aslında **aynı şeyi** yapıyor: "B sütunundaki kendi satırının değerini 1.18 ile çarp". Bu formülleri ham haliyle LLM'e atmak hem mantıksız hem pahalı.

Yaptığımız: her formülü **iki adımda genelleştiriyoruz**.

**Adım A — Satır numarasını `{row}` ile değiştir:**

```
=B2*1.18  → =B{row}*1.18
=B3*1.18  → =B{row}*1.18
=B4*1.18  → =B{row}*1.18
```

Hepsi aynı oldu! Çünkü her hücre kendi satırına refere ediyor.

**Adım B — Sayısal sabitleri `{const}` ile değiştir:**

```
=B{row}*1.18  → =B{row}*{const}
```

Buna **skeleton** (iskelet/kalıp) diyoruz. Ham formüldeki "değişken kısımlar" (satır numarası, sabit sayı) silinmiş, sadece "yapı" kalmış. Bu, formülün **parmak izi**.

İşin güzel yanı: 99 farklı formül artık **TEK skeleton** altında toplanıyor. Raporda 99 satır yerine 1 satır.

## 4. Şablonlar tablosu — workbook geneli

Skeleton'ları sadece bir sheet içinde değil, **tüm workbook genelinde** birleştiriyoruz. 12 aylık bir dosyada Ocak/Şubat/Mart sheet'lerinde aynı formüller varsa:

```
| Skeleton          | Sheet+Aralıklar                       | Hücre | Sabit Dağılımı |
| =B{row}*{const}   | Ocak: C2:C100; Şubat: C2:C100; ...    | 1200  | 1.18 (1199),   |
|                   | Aralık: C2:C100                       |       | 1.20 (1) ⚠     |
```

Tek satırda görüyorsunuz ki:

- Bu şablon 12 ayda da aynı şekilde uygulanmış
- 1200 hücreyi kapsıyor
- 1199'unda KDV 1.18 olarak hesaplanmış, **1 hücrede 1.20** — bu muhtemelen yanlış girilmiş bir KDV (⚠ outlier)

LLM'e bu tek satırı verince hem yapıyı hem anomaliyi tek bakışta yakalar.

## 5. Sabit dağılımı = anomali sezgisi

Skeleton içindeki `{const}` placeholder'ı bir **histogram** tutuyor — hangi sayı kaç hücrede kullanılmış?

- Hepsi aynı sayı → tutarlı
- %80+ aynı, küçük bir azınlık farklı → **sapma** (büyük ihtimalle hata)
- Karmakarışık → **karışık** (kasıtlı çeşitlilik olabilir, denetim gerekir)

Bu, manuel KDV oranı değiştirmeyi, indirim oranı tutarsızlığını veya sabit unutmasını otomatik tespit eder.

## 6. Diğer toplulaştırmalar

Aynı mantıkla:

- **Çapraz Sayfa Referansları:** "Bu sheet'te 30 hücre `Stok!` sheet'ine bakıyor" — bağımlılık haritası
- **Named Ranges:** kullanıcının `KDV_ORANI` gibi isimlendirmeleri
- **External Links:** başka Excel dosyalarına bakan formüller (kırılma riski)
- **Gizli Sheet'ler:** kullanıcının görünür olmayan ama önemli olabilecek alanları

Hepsi tek bir Markdown raporunda paketleniyor.

## 7. Hassas veri triajı

Excel'inizde müşteri adı, sicil numarası gibi şeyler varsa, formülün **hesaplanmış değeri** (örn. "Galataport") raporda görünebilir. Bu yüzden analizden önce bir popup açılıyor:

- 3 sekme: **Metin / Sayısal / Ondalıklı**
- Her benzersiz değer bir satır
- "Hassas mı?" işaretleyebiliyorsunuz

İşaretlediğiniz değerler raporda `***` ile gizleniyor; formül yapısı (skeleton) görünür kalıyor — yani LLM "ne yapıyor" görür ama "hangi müşteri" görmez.

## 8. Alt küme indirme

Workbook 30 sheet ise tüm raporu LLM'e atmak yerine: bir sheet seçip "bu sheet + onun referans verdiği sheet'ler" alt-kümesini indirebilirsiniz. LLM tek bir göreve odaklanır.

## Özet — akışın tek bakışta hali

```
.xlsx → SheetJS parse → her formülü skeleton'a dök → workbook genelinde birleştir
     → sabit histogramı + anomali tespiti → triaj → Markdown rapor → siz LLM'e atın
```

**"Skeleton"** = formülünüzün soyut kalıbı; içindeki değişen kısımlar (satır numarası, sayı sabiti) `{row}` ve `{const}` ile yer tutuldu. Aynı kalıba dökülen 1000 formül tek satırda toplanıyor. **LLM token bütçesi düşüyor, anomaliler ön plana çıkıyor.**
