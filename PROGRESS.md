# PROGRESS — SEYİR sanal stadyum

Oturum kesilirse: bu dosyayı oku, "ŞU AN" bölümünden devam et.

## Kilometre taşları
- [ ] KT1 — Sahne (stadyum, saha, ışık, orbit kamera, giriş hareketi)
- [ ] KT2 — Arayüz (kartlar, mini haritalar, filtre, mobil panel)
- [ ] KT3 — Koltuk seçimi ve geçiş (hover, uçuş, koltuk görünümü, URL)
- [ ] KT4 — Etkinlik katmanı (maç, sahne modu, akış, ses)
- [ ] KT5 — Seyirci ve bilet (bilet, tepkiler, eş zamanlılık)
- [ ] KT6 — Cila ve teslim (performans, inceleme, tek dosya, README)

## ŞU AN
Bütün kilometre taşlarının kodu yazıldı; `npm test` senaryoları (masaüstü, telefon, sunucu,
dayanıklılık) ayrı ayrı koşulup geçti. README yazıldı, tek dosyalık derleme çalışıyor.
Sıradaki adımlar (cila turu):
1. Sağ sütun kart yerleşimi (koltuk seçiliyken harita kartıyla çakışma) düzeltildi → ekran
   görüntüsüyle tekrar doğrula.
2. Maç ve sahne modunu yakın planda incele; ışık / geçiş hissi / mobil cilası.
3. Kod incelemesi (ölü kod, dispose), README'deki ekran görüntülerini docs/ altına koy.
4. Son tam `npm test`, PROGRESS kutularını işaretle, commit + push.

## Notlar
- Playwright küresel kurulu: /opt/node-tools/node_modules/playwright (1.63.0),
  tests/e2e.mjs oradan da çözer.
- mercedes_benz_v_class.glb repoda önceden vardı, bu ürünle ilgisi yok, dokunulmadı.
- Bu ortamda GPU yok: headless Chromium SwiftShader ile ~3 fps veriyor (örnek sayısı ve dolgu
  maliyeti). Gerçek fps burada ölçülemez; testler süre yerine durum bekler. Uygulama yavaş kareyi
  algılayıp kaliteyi kendisi düşürür (testlerde hep "low" olur).
- Uzak bloklar birleştirilmiş statik geometri (LOD), yakın bloklar InstancedMesh; seçim her zaman
  InstancedMesh üzerinden instanceId ile.
