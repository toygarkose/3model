# LAST TOUCH — 3D Futbol Hikâye Oyunu (Tarayıcı Sürümü, MVP 0.1)

Parmağınla çizerek pas ver, falso ver, golü at. Küçük bir liman kasabasından kupa finaline uzanan
kurgusal bir kariyer. Three.js + saf JavaScript; kurulum gerektirmez, ücretli asset yoktur
(tüm modeller, dokular ve sesler kodla üretilir).

## Çalıştırma

```bash
cd last-touch
npm install        # bir kez
npm run dev        # http://localhost:5173  (aynı Wi-Fi'deki telefondan "Network" adresiyle açılır)
```

Tek dosyalık sürüm: `npm run build` → `dist/last-touch.html` (çift tıklayıp açmak yerine bir sunucudan açın:
`npm run preview`).

## Nasıl oynanır
- **Topa dokun ve çiz.** Takım arkadaşına doğru çizgi = pas. Kaleye doğru çizgi = şut.
- **Çizgiyi bük** = falso (pasları defansın etrafından dolaştır, şutları köşeye kıvır).
- **Hızlı kaydır** = sert şut. Yavaş kaydır = yumuşak/aşırtma.
- 24 metreden uzun paslar otomatik olarak havadan gider; ceza sahasına havadan pas = kafa vuruşu fırsatı.
- Yerdeki kesikli oklar takım arkadaşlarının koşu yollarını gösterir — topu onların **gideceği yere** at.
- Yıldızlar: ★ hedef · ★ hamle sınırı (par) · ★ stil (köşe, falso, kafa, mükemmel pas).

## Mimari (src/)

| Klasör / dosya | Görev |
|---|---|
| `game/config.js` | **Tüm ayarlanabilir sayılar** (hızlar, falso, kaleci, yıldız kuralları) |
| `game/match.js` | Saf maç simülasyonu (çizim yok) — tarayıcıda ve Node testlerinde aynı kod |
| `game/trajectory.js` | Top yolu: kavisli Bezier + yükseklik yayı + hız profili (önizleme = gerçek uçuş) |
| `game/passing.js`, `game/shooting.js` | Pas ve şut sistemleri (koşucuya otomatik hizalama dahil) |
| `game/ballPhysics.js` | Serbest top fiziği, file, direk, gol çizgisi |
| `game/playerController.js` | Oyuncu hareketi (zamanlı koşular) |
| `ai/opponentAI.js`, `ai/goalkeeperAI.js` | Savunma kesme/baskı/markaj, kaleci okuma ve uçuş |
| `game/interpreter.js`, `input/gesture.js` | Dokunma/fare çizimi → pas/şut yorumu |
| `game/levelManager.js` | Bölüm akışı: sahne, kamera, olaylar, ses, sonuç |
| `scene/*` | Stadyum, oyuncu modeli, prosedürel animasyon, top, efektler, sinematik kamera |
| `levels/*.js` | **Her bölüm ayrı dosya** + `teams.js` (kurgusal kulüpler) + `index.js` (liste) |
| `career/*` | Kariyer, hikâye, başarımlar, kozmetikler (yalnızca oyun içi jeton — pay-to-win yok) |
| `ui/*` | Menüler, HUD, sonuç ekranları, stil |
| `audio/audio.js` | Kodla sentezlenen sesler ve seyirci |

## Yeni bölüm eklemek
1. `src/levels/11-yeni-bolum.js` oluştur (mevcut bir bölümü kopyala).
   Koordinatlar metre: kale `z = -52.5`, saha genişliği `x = -34..34`.
2. `src/levels/index.js` listesine ekle, `src/career/story.js` → `CHAPTERS` içine numarasını yaz.
3. `npm run check-levels` — bölümün gerçekten çözülebildiğini binlerce atışla doğrular.

## Testler
```bash
npm run check-levels                      # tüm bölümler çözülebilir mi? (Node, gerçek simülasyon)
npm run build && npx vite preview --port 4173 &
npm test                                  # tarayıcıda 10 bölümü baştan sona oynar + fare testi + konsol hatası kontrolü
```

## Telif notu
İsimler, kulüpler, oyuncular, stadyum, arayüz ve hikâye tamamen orijinaldir. Gerçek kulüp/oyuncu/marka
kullanılmaz. Oyun türünün genel mekaniği (çizerek pas/şut) serbesttir; başka bir oyunun görselleri,
bölümleri veya metinleri kopyalanmamıştır.
