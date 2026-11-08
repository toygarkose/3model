# STRIKER STORY — Çek-bırak futbol kariyer oyunu (MVP 0.1)

Tek bir oyuncunun kariyeri: 17 yaşında County League'de başla, Elite League'e yüksel.
Maçlar senin dahil olduğun **anlar** olarak oynanır; aradaki her şeyi yorum akışı anlatır.
Tarayıcıda çalışır, kurulum yok, harici asset yok (çizim ve sesler kodla üretilir).

## Çalıştırma
```bash
cd striker-story
npm install
npm run dev        # http://localhost:5173 (telefondan "Network" adresiyle)
npm run build      # dist/striker.html — tek dosyalık oyun
```

## Kontroller
- Ekranın herhangi bir yerinden **geri çek, bırak**: çekme uzunluğu = güç, yönün tersi = şut yönü.
- Çekerken parmağını **kavisli** hareket ettir = falso. Parmağının çizdiği eğri 180° döndürülmüş haliyle topun kavisi olur.
- **CHIP** düğmesi = aşırtma (kaleci önde ya da baraj üstünden).
- Açık oyunda süre sınırı var (topun etrafındaki halka): savunma kapanmadan karar ver.
- Takım arkadaşına pas atabilirsin; ilişkin iyiyse topu sana geri verir (verkaç), değilse kendisi vurur (asist).

## Kariyer (New Star Soccer'dan esinlenen döngü)
| Sistem | Etkisi |
|---|---|
| Enerji | Antrenman ve etkinlikler harcar; düşük enerji = zayıf ve isabetsiz şut, daha kısa baskı süresi |
| Teknik direktör güveni | Düşükse yedek başlarsın, maçta daha az an |
| Takım bağı | Yüksekse sana daha çok pas gelir (daha çok an) ve verkaç yaparlar |
| Beceriler | Şut (nişan konisi), Güç (top hızı), Falso (kavis), Vizyon (tahmin çizgisi uzunluğu), Soğukkanlılık (karar süresi) |
| Para ve mağaza | Enerji içeceği, krampon (+falso / +isabet), kişisel antrenör, ev / araba (haftalık enerji, mutluluk) |
| Lig | 8 kulüp, 14 maçlık sezon, puan tablosu, gol krallığı, şampiyonlukta üst lige çıkış |
| Transfer | İyi form → üst lig kulüplerinden teklif; sezon sonunda geçersin |

## Gerçekçi top fiziği (`src/sim/ball.js`)
- Hava direnci gerçek top değeriyle: 0,5·ρ·Cd·A/m ≈ 0,013 1/m
- Magnus etkisi: falso, topun hızıyla orantılı yan kuvvet üretir
- Yerçekimi, sekme ve yuvarlanma sürtünmesi
- Kaleci topun **o anki** yönünü okur; kavisli şut onu geç kandırır. Penaltıda kaleci önceden bir taraf seçip atlar.
- Savunmacı sert şuta koşamaz, sadece uzanır. Baraj gerçek boyda zıplar (yaklaşık 2,05 m).

## Yapı
```
src/sim/      top fiziği + maç anları (kaleci, savunma, baraj, takım arkadaşları) — saf mantık
src/game/     momentPlay (çek-bırak, efektler) · matchFlow (90 dk akış, not)
src/career/   kariyer, haftalık döngü, mağaza, lig, transferler
src/render/   yayın kamerası perspektifinde saha, kale, file, oyuncular
src/ui/       ekranlar · src/audio/ sentez sesler · src/fx/ efekt + titreşim
tools/balance.mjs   her an tipi için beceri seviyesine göre gol şansı ölçümü
tools/playtest.mjs  tarayıcıda yeni kariyer + antrenman + tam sezon testi
```

## Denge (npm run balance)
En iyi nişanla gol şansı (acemi / orta / yıldız): penaltı 75 / 83 / 92%, karşı karşıya 41 / 78 / 99%,
ceza sahası önü 21 / 38 / 65%, serbest vuruş 39 / 68 / 89%.

## Not
İsim, kulüpler, ligler, oyuncular ve görseller tamamen kurgusal ve orijinaldir. "Striker Story" çalışma
adıdır; yayından önce marka araması yapılmalıdır.
