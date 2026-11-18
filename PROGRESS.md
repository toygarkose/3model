# PROGRESS — SEYİR sanal stadyum

Oturum kesilirse: bu dosyayı oku, "ŞU AN" bölümünden devam et.

## Kilometre taşları
- [x] KT1 — Sahne (stadyum, saha, ışık, orbit kamera, giriş hareketi)
- [x] KT2 — Arayüz (kartlar, mini haritalar, filtre, mobil panel)
- [x] KT3 — Koltuk seçimi ve geçiş (hover, uçuş, koltuk görünümü, URL)
- [x] KT4 — Etkinlik katmanı (maç, sahne modu, akış, ses)
- [x] KT5 — Seyirci ve bilet (bilet, tepkiler, eş zamanlılık)
- [x] KT6 — Cila ve teslim (LOD/kalite, inceleme, tek dosya, README) — gerçek GPU'da fps ölçümü hariç

## ŞU AN
Bütün kilometre taşları tamamlandı, commit'lendi ve `claude/focused-dijkstra-k7h20u` dalına
push edildi. Son tam `npm test` koşusunun sonucu README'nin "Tamamlananlar" bölümünde.

Devam edilecekse (öncelik sırasıyla):
1. Gerçek GPU'lu bir dizüstü ve telefonda kare hızını ölç (README "Bilinen sorunlar").
2. Zaman kalırsa yeni özellik değil cila: geçiş hissi, ışık, mobil deneyim.
3. README'deki ekran görüntüleri `docs/` altında; arayüz değişirse scratch betikle yeniden üret.

## Notlar
- Playwright küresel kurulu: /opt/node-tools/node_modules/playwright (1.63.0),
  tests/e2e.mjs oradan da çözer.
- mercedes_benz_v_class.glb repoda önceden vardı, bu ürünle ilgisi yok, dokunulmadı.
- Bu ortamda GPU yok: headless Chromium SwiftShader ile ~3 fps veriyor (örnek sayısı ve dolgu
  maliyeti). Gerçek fps burada ölçülemez; testler süre yerine durum bekler. Uygulama yavaş kareyi
  algılayıp kaliteyi kendisi düşürür (testlerde hep "low" olur).
- Uzak bloklar birleştirilmiş statik geometri (LOD), yakın bloklar InstancedMesh; seçim her zaman
  InstancedMesh üzerinden instanceId ile.
