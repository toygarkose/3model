# SEYİR — sanal stadyum

Tarayıcıda çalışan bir "sanal stadyum": 3B stadyumu dışarıdan gezersin, bir koltuğa
tıklarsın, kamera o koltuğa uçar ve sahadaki canlı etkinliği oradan izlersin.
Harici model, doku, font ya da ağ bağımlılığı yoktur; her şey kodla üretilir ve
uygulama çevrimdışı açılır.

![Stadyum görünümü](docs/stadyum.png)

| Koltuk görünümü | Sahne modu | Telefon |
| --- | --- | --- |
| ![Koltuk](docs/koltuk.png) | ![Sahne](docs/sahne.png) | ![Telefon](docs/telefon.png) |

## Çalıştırma

```bash
npm install
npm run dev            # geliştirme sunucusu (http://localhost:5173)

npm run build          # tip denetimi + üretim derlemesi → dist/
npm run preview        # dist/ → http://localhost:4173
npm run build:single   # her şeyi içeren tek HTML → dist-single/index.html (çift tıkla aç)
npm test               # derler ve uçtan uca senaryoları koşar (Playwright, headless Chromium)
npm run server         # isteğe bağlı eş zamanlılık sunucusu (ws://localhost:8787)
```

`npm test` için Playwright gerekir. Depoda bağımlılık olarak tutulmaz (tarayıcı
indirmesi ağırdır): `npm i -D playwright && npx playwright install chromium` ile kur.
Testler her adımda `tests/shots/` altına ekran görüntüsü bırakır.

Farklı cihazları bağlamak için: `npm run server`, sonra uygulamayı her cihazda
`?ws=ws://<sunucu-ip>:8787` parametresiyle aç. Sunucu yoksa ya da düşerse uygulama
aynen çalışmaya devam eder; aynı tarayıcıdaki sekmeler sunucusuz da birbirini görür.

### URL parametreleri

| Parametre | Anlamı |
| --- | --- |
| `#koltuk=112-14-23` | Doğrudan o koltuğa in (blok-sıra-koltuk). "Bağlantıyı kopyala" bunu üretir. |
| `#etkinlik=mac` / `sahne` | Açılış etkinliği |
| `?ws=ws://host:8787` | Eş zamanlılık sunucusu |
| `?video=https://…/a.mp4` | Sahne modunda dev ekran videosu (CORS izni gerekir) |
| `?kalite=yuksek` / `orta` / `dusuk` | Kaliteyi elle sabitle (varsayılan: otomatik) |

## Mimari

```
src/
  config/venue.ts        Mekan yapılandırması: ölçüler, katlar, bloklar, renkler, fiyatlar, etkinlik bilgisi
  core/store.ts          Tek merkezli durum (mod, seçili koltuk, etkinlik evresi, filtre, biletler…)
  core/oval.ts, rng.ts   Süper-elips geometrisi, sabit tohumlu rastgelelik, easing yardımcıları
  data/seats.ts          Koltuk verisi üretimi (typed array), blok/sıra düzeni, görüş puanı, fiyat, komşuluk
  scene/setup.ts         Renderer, kamera, boyutlandırma (DPR ≤ 2), kalite algılama, dispose yardımcıları
  scene/stadium.ts       Saha, basamaklı tribünler, cephe, çatı, projektörler ve hüzmeler, skorbord, şehir
  scene/seatField.ts     Koltuklar + seyirciler (InstancedMesh + LOD), seçim, vurgu, filtre, tepki animasyonu
  camera/controller.ts   Orbit, koltuğa uçuş (kübik Bezier + slerp), koltuk görünümü, girdi kilidi
  interaction/pointer.ts Pointer Events: sürükle / tıkla ayrımı, pinch, tekerlek
  interaction/picking.ts Raycaster → instanceId → koltuk kaydı
  events/types.ts        EventSource arayüzü
  events/director.ts     Geri sayım → CANLI → bitti akışı, skorbord çizimi, kaynak değişimi
  events/sources/        match.ts (simüle maç), stage.ts (sahne, ışık şovu, dev ekran)
  audio/audio.ts         Web Audio sentezi: tribün uğultusu, gol, alkış, tezahürat, düdük, müzik
  net/sync.ts            BroadcastChannel + isteğe bağlı WebSocket; varlık, bilet ve tepki mesajları
  ui/                    Düz HTML/CSS arayüz: kartlar, mini haritalar, bilet, diyaloglar, telefon paneli
  main.ts                Bileşenleri bağlar: eylemler, kare döngüsü, kalıcılık, URL
server/server.mjs        İsteğe bağlı WebSocket aktarıcı (durum tutmaz)
tests/e2e.mjs            Uçtan uca doğrulama senaryoları
```

Akış: girdi → **eylem** (`main.ts`) → **durum** (`Store`) → 3B katman ve arayüz durumu dinler.
Her karede değişen şeyler (kamera noktası, skor/süre metni) depo yerine doğrudan güncellenir.

Öne çıkan teknik kararlar:

- **42.842 koltuk**, blok başına bir `InstancedMesh`. Seçim `Raycaster` ile yapılır;
  `instanceId` + bloğun başlangıç indeksi doğrudan koltuk kaydını verir. Blok bazlı
  sınırlayıcı küreler sayesinde bir ışın yalnızca birkaç bloğu dener.
- **LOD:** kameraya uzak bloklar, blok başına tek birleştirilmiş statik geometriyle
  (koltuk 4 üçgen, seyirci 20 üçgen) çizilir; yakın bloklar ayrıntılı instanced
  geometriye geçer. Orbit görünümü ~460 bin üçgen, ~220 çizim çağrısı.
- **Seyirci hareketi** (zıplama, dalga) vertex shader'da; CPU maliyeti yok.
- **Görüş puanı** uydurma değil: `100 × (0.5·yakınlık + 0.2·yükseklik açısı + 0.3·yan açı)`
  (bkz. `viewScore`). Fiyat, kat aralığı içinde puanla orantılıdır.
- **Önizleme** ayrı bir render hedefi yerine ana canvas'ın köşesine çizilip 2B
  canvas'a kopyalanır; ton eşleme ana görüntüyle birebir aynıdır.
- **Kalite** cihazdan tahmin edilir, sonra kare süresi izlenir; ortalama 27 ms'yi
  2,5 sn aşarsa piksel oranı, kalabalık yoğunluğu ve LOD mesafesi bir kademe düşer.

## Yapılandırma dosyasıyla yeni mekan üretme

Stadyumun tamamı `src/config/venue.ts` içindeki tek bir `VenueConfig` nesnesinden üretilir.
Yeni mekan için nesneyi kopyala, düzenle ve `ACTIVE_VENUE` olarak dışa aktar:

```ts
export const KUCUK_ARENA: VenueConfig = {
  ...SEYIR_ARENA,
  name: 'Küçük Arena',
  bowl: { a: 60, b: 44, exponent: 3, firstRowHeight: 1.4 },   // iç oval yarı eksenleri (m) ve köşe sertliği
  tiers: [
    { ...SEYIR_ARENA.tiers[0], rows: 16, blocks: 16 },            // 1xx
    { ...SEYIR_ARENA.tiers[2], rows: 12, blocks: 18, gap: 2, lift: 4, code: 2, name: 'Üst Kat' }, // 2xx
  ],
  blockColors: ['#ffb4a2', '#cdb4db', '#bde0fe'],
  occupancy: 0.5,
  seed: 7,
};
export const ACTIVE_VENUE = KUCUK_ARENA;
```

Kat sayısı, sıra sayısı, sıra derinliği/yüksekliği, blok sayısı, blok renk döngüsü, fiyat
aralıkları, avantaj listeleri, doluluk oranı, tohum, saha ölçüsü, cephe yüksekliği, takım ve
sanatçı bilgileri ve etkinlik süreleri buradan gelir. Blok numaraları `code` alanından
(1 → 1xx) türetilir; mini haritalar, filtreler ve kamera sınırları aynı veriden hesaplanır.

## Yeni etkinlik türü ekleme

`src/events/sources/` altına `EventSource` arayüzünü uygulayan bir fabrikayı
`export default` eden tek dosya ekle; `director.ts` klasörü `import.meta.glob` ile tarar,
menüye ve akışa kendiliğinden eklenir. Kaynak; 3B nesnelerini verilen gruba ekler,
`update(dt, liveTime, phase)` ile ilerler, skorbordu çizer ve `cue()` ile tribüne/sese
işaret gönderir (gol, alkış, düdük…).

## Tamamlananlar

**Sahne** — Gece atmosferi, oval 3 katlı stadyum, ışıklı pencereli cephe, yarı saydam çatı,
projektör direkleri ve hacimli ışık hüzmeleri, çizgili çim saha, LED reklam panoları, iki
skorbord, şehir silüeti. Pastel renkli bloklar; 1xx alt, 2xx orta (club), 3xx üst kat.
Orbit kamera (sürükle, tekerlek/pinch, yandan kuşbakışına, zemin altına inmez, tribünün içine
girmez), sıfırla butonu, yükleme ekranı ve giriş hareketi.

**Arayüz** — Logo, hap menü, favoriler / koltuklarım, etkinlik kartı, kamera kartı (kuşbakışı
mini harita + kamera noktası), blok mini haritası (tıkla → kamera bloğa döner, klavyeyle
gezilebilir), koltuk kartı (durum, blok, kat, sıra/koltuk/fiyat, canlı önizleme, görüş puanı,
avantajlar, "Koltuğu al"), kat + fiyat filtresi (filtre dışı koltuklar soluklaşır), telefonda
alttan açılan sekmeli panel (sahne panelin üstünde ortalanır), neo-brutalist stil, klavye
erişimi ve görünür odak, Türkçe.

**Koltuk seçimi ve geçiş** — Hover (el imleci, vurgu, tooltip), tıklama ile ~1,35 sn'lik
easing'li uçuş, geçişte girdi kilidi, önizlemenin "görünüm hazırlanıyor" sonrası dolması,
mini harita işaretçisinin kayması, koltuk araç çubuğu, dolu koltukta aynı sıradaki en yakın
boş koltuğa yönlendirme, birinci şahıs görünüm (sınırlı bakış, zoom, dolu tribünler), ok
tuşu/butonla komşu koltuk, aynı uçuşla geri dönüş, paylaşılabilir koltuk bağlantısı.

**Etkinlik katmanı** — `EventSource` arayüzü; simüle maç (22 oyuncu + hakem, paslaşma, top
kapma, şut, kurtarış, gol, taç/kale vuruşu, devre arası, işleyen skor ve süre, gol sevinci)
ve sahne modu (sahne, hareketli ışık hüzmeleri, dev ekranda canvas ile üretilen içerik,
isteğe bağlı video URL'si, sahada ayakta seyirci, sentez müzik). Geri sayım → CANLI → bitti
akışı ve "Demo" düğmesi. Etkinliğe tepki veren ortam sesi, aç/kapa ve seviye.

**Seyirci ve bilet** — Ödemesiz "Koltuğu al", bilet kartı, `localStorage` kalıcılığı,
"Koltuğuma git", koltuğu bırakma, favoriler. Alkış / tezahürat / dalga tepkileri (blokta
görsel + sesli; dalga stadyumu dolaşır). BroadcastChannel ile sekmeler arası, isteğe bağlı
WebSocket sunucusuyla cihazlar arası varlık, bilet ve tepki paylaşımı; sunucusuzken sahte
seyirci hareketi.

**Cila ve teslim** — Mesafeye dayalı LOD, otomatik kalite, WebGL yokluğu ve bağlam kaybı
mesajları, sekme arka planında zaman sıçramasına karşı delta sınırı, tek dosyalık derleme,
49 + 20 + 6 + 5 kontrol içeren uçtan uca test.

## Yapılmayanlar

- Gerçek ödeme, hesap/oturum ve sunucu tarafında koltuk kilitleme yok. Bilet yalnızca bu
  tarayıcıda saklanır; iki cihaz aynı koltuğu aynı anda alırsa çakışma çözülmez.
- WebSocket sunucusu yalnızca aktarıcıdır: kalıcı durum, kimlik doğrulama, oda kavramı yok.
- Koltuk görünümündeyken başka bir koltuğa tıklayarak geçiş yok (bilinçli karar; ok
  tuşları/butonlar ve listeler kullanılır).
- Maç simülasyonu basitleştirilmiştir: ofsayt, faul, korner, kart ve oyuncu değişikliği yok;
  top saha dışına çıkınca taç/kale vuruşu en yakın oyuncuya verilir.
- Gölge haritaları, yansıma, post-process (bloom) yok; ışık hüzmeleri toplamalı konilerdir.
- Gerçek seyirci avatarı/sohbet yok; başka seyirciler tribünde işaretçi olarak görünür.
- Dil yalnızca Türkçe.

## Bilinen sorunlar

- **Kare hızı gerçek GPU'da ölçülemedi.** Geliştirme ortamında GPU yoktu; testler yazılım
  tabanlı WebGL (SwiftShader) üzerinde koştu ve orada 1440×900'de ~3–8 fps alındı (bu
  ortamda maliyet doldurma ve köşe işlemeye bağlı, gerçek donanımı temsil etmez). 60/30 fps
  hedefi üçgen ve çizim çağrısı bütçesiyle (orbit ~460 bin üçgen / ~220 çağrı) ve otomatik
  kalite düşürmeyle güvenceye alınmaya çalışıldı ama gerçek bir dizüstü ve telefonda
  doğrulanması gerekir.
- Çok yavaş cihazlarda (≤10 fps) animasyon zamanı kare başına 0,1 sn ile sınırlandığı için
  geçişler ağır çekimde oynar.
- Birleştirilmiş uzak geometri ~30 MB GPU belleği kullanır; çok düşük bellekli telefonlarda
  bağlam kaybı görülebilir (uygulama bunu mesajla bildirir ve geri geldiğinde sürer).
- Koltuk görünümünde alt kat sıralarında (sıra yükselmesi 40 cm) öndeki seyircilerin başları
  görüşün alt kısmına girer; bu gerçekçi ama dar ekranda sahanın yakın kenarını kapatabilir.
- Dev ekran videosu farklı kaynaktan geliyorsa sunucunun CORS izni vermesi gerekir; vermezse
  uygulama mesaj gösterip varsayılan içeriğe döner.
- Tek dosyalık derleme `file://` ile açıldığında bazı tarayıcılar sekmeler arası
  BroadcastChannel'ı ve pano erişimini kısıtlar; uygulama bunlar olmadan da çalışır.

## Ticari sürüm için önerilen sonraki 5 adım

1. **Gerçek mekan ve envanter bağlantısı.** Bir kulüp/mekanın gerçek oturma planını
   (blok-sıra-koltuk + fiyat kategorisi) `VenueConfig`'e ve bilet sağlayıcısının envanter
   API'sine bağla; koltuk durumunu sunucudan canlı al, sepette süreli koltuk kilidi kur.
2. **Ödeme ve hesap.** Kimlik, ödeme sağlayıcısı (iyzico/Stripe), e-bilet (QR) ve
   "koltuğumdan izle" hakkının hesapla eşlenmesi; KVKK/GDPR metinleri.
3. **Gerçek yayın.** `EventSource` olarak düşük gecikmeli canlı video (HLS/WebRTC) ve
   maç verisi akışı (skor, olaylar) ekle; hak sahipleriyle koltuk kategorisine göre kamera
   açısı/perde boyutu paketleri tasarla.
4. **Ölçeklenen sosyal katman.** Durum tutan gerçek zamanlı servis (oda başına blok,
   yetkili sunucu, hız sınırı, moderasyon), arkadaşlarla yan yana oturma, sesli tezahürat
   odaları, sponsorlu tepkiler.
5. **Cihaz kapsamı ve ölçüm.** Gerçek cihaz laboratuvarında performans profili (orta
   seviye Android dahil), görsel kalite kademeleri (gölge, bloom), analitik (koltuk
   önizleme → satın alma dönüşümü) ve mekan başına beyaz etiket tema desteği.
