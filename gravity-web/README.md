# GRAVITY — Gerçek Fizikli Uzay Sapanı (Web sürümü 0.2)

Geri çek, bırak, gezegenlerin gerçek yerçekimiyle yolunu bük. 3 dünya, 36 bölüm.
Saf JavaScript + WebGL; harici asset yok (gezegenler shader, sesler sentez).

## Çalıştırma
```bash
cd gravity-web
npm install
npm run dev            # http://localhost:5173 (telefondan "Network" adresiyle)
npm run build          # dist/gravity.html — tek dosyalık oyun
```

## Gerçek bilim nasıl kullanılıyor
| Fizik | Oyunda |
|---|---|
| Yüzey çekimi (NASA verisi) | Her gök cisminin yüzeyindeki çekim Dünya'ya oranla **gerçek** (Ay 0,165 g, Mars 0,38 g, Jüpiter 2,53 g). Boyutlar ekrana sığsın diye sıkıştırıldı; kütle GM = g·R² ile buradan hesaplanır. |
| Kurtulma hızı | Bölümdeki fırlatma hızı en güçlü çekim kuyusunun kurtulma hızına (√(2GM/R)) göre ayarlanır. Çarpışmada hız gerçek km/s'ye çevrilip gösterilir. |
| Kepler'in 3. yasası | Uydular ω = √(GM/R³) ile döner. Fırlatınca hareket başlar. |
| Ortak kütle merkezi | Pluto–Charon ikilisi aralarındaki boş bir nokta etrafında döner (gerçekte de öyle). |
| Kütleçekim yardımı | Hız kazancı sadece **hareket eden** cisimlerden mümkündür (sabit bir gezegen enerji vermez). |
| Atmosfer | Venüs (92 bar), Titan, Dünya gerçek yüzey basıncına göre gemiyi yavaşlatır. |
| Halkalar | Satürn halkaları buzdur ve gemiyi parçalar; Cassini Boşluğu'ndan geçilebilir. |
| Kara delik | Olay ufku r = 2GM/c² ile hesaplanır; gölgesi gerçek oranda ~2,6 r. |
| Dönme | Gezegenlerin dönüş hızları gerçek gün uzunluklarıyla orantılı (Venüs ters döner, Uranüs 98° yan yatık). |

## Yapı
```
src/data/bodies.js     gerçek gök cismi verileri + oyun ölçeği dönüşümleri
src/data/worlds.js     dünyalar ve her bölümün "tarifi"
src/data/levels.json   ÜRETİLMİŞ bölümler (elle düzenlemeyin; tarifi değiştirip yeniden üretin)
src/core/physics.js    fizik motoru (oyun + üretici aynı kodu kullanır)
src/core/game.js       nişan, fırlatma, uçuş, olaylar, sonuç
src/render/gl.js       WebGL: bulutsu, yıldızlar, dönen gezegenler, kara delik
src/render/draw2d.js   gemi, izler, halkalar, portal, yıldız parçaları, efektler
src/fx/                parçacık/sarsıntı/ağır çekim ve titreşim
src/audio/audio.js     sentezlenmiş sesler (şarj tonu dahil)
src/ui/                menüler, HUD, sonuç ekranı
tools/generate-levels.mjs  bölüm üretici + çözücü
tools/playtest.mjs         tarayıcıda tüm bölümleri 3 yıldızla oynayan test
```

## Bölüm eklemek
1. `src/data/worlds.js` → `RECIPES` listesine bir tarif ekle (cisimler, uydular, halkalar, asteroitler).
2. `npm run levels` — üretici binlerce atış dener; çözülebilir, düz atışla geçilemeyen ve zorluğu
   sıraya uyan yerleşimi seçer, 3 yıldız parçasını gerçek bir kavisli rotaya yerleştirir.
3. `npm run build && npm run preview &` sonra `npm test`.

## Zorluk
- Tam rota gösterilmez: sadece yolun başı (Ayarlar → Aim guide: Arrow / Short / Long).
- Önceki 3 denemenin silik izi ekranda kalır; Angry Birds gibi denemeden öğrenilir.
- Yıldız = kazanan uçuşta toplanan parça sayısı. Puan: portal + parçalar + yakın geçiş + kütleçekim yardımı + az deneme.
