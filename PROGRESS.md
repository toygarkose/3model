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
Kod tabanının tamamı yazıldı ve derleniyor (sahne, koltuklar, kamera, UI, etkinlikler, ses, ağ).
Elle (Playwright ekran görüntüsü) doğrulananlar: masaüstü orbit görünümü, hover tooltip,
koltuğa uçuş, koltuk görünümü + kart + önizleme, telefon ilk görünüm.
Sıradaki adımlar:
1. tests/e2e.mjs yaz (npm test): yükleme, konsol, canvas dolu, koltuk tıklama, stadyuma dön,
   dolu koltuk yönlendirme, etkinlik modu, bilet, 390x844 dokunmatik. Ekran görüntülerine bak.
2. Maç demosu ve sahne modunu görsel olarak incele, cilala.
3. Bilet / tepkiler / BroadcastChannel iki sekme testi.
4. Tek dosya derleme, README, son kod incelemesi.

## Notlar
- Playwright küresel kurulu: /opt/node-tools/node_modules/playwright (1.63.0),
  tests/e2e.mjs oradan da çözer.
- mercedes_benz_v_class.glb repoda önceden vardı, bu ürünle ilgisi yok, dokunulmadı.
- Bu ortamda GPU yok: headless Chromium SwiftShader ile ~3 fps veriyor (örnek sayısı ve dolgu
  maliyeti). Gerçek fps burada ölçülemez; testler süre yerine durum bekler. Uygulama yavaş kareyi
  algılayıp kaliteyi kendisi düşürür (testlerde hep "low" olur).
- Uzak bloklar birleştirilmiş statik geometri (LOD), yakın bloklar InstancedMesh; seçim her zaman
  InstancedMesh üzerinden instanceId ile.
