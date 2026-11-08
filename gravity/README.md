# GRAVITY — Mobil Uzay Fiziği Oyunu (MVP 0.1)

Küçük bir uzay gemisini fırlat, gezegenlerin yerçekimiyle yolunu bük, hedefe ulaş.
Godot 4 + GDScript, 2D, dikey (portrait) mobil ekran. Harici asset yok: gezegenler
shader ile, sesler kodla üretiliyor.

## 1. Godot kurulumu

1. https://godotengine.org/download adresinden **Godot 4.3 veya daha yeni bir 4.x**
   sürümünü indir (standart sürüm yeterli, .NET sürümüne gerek yok).
2. Zip'i aç; kurulum yok, `Godot_v4.x...exe` (Windows) / `.app` (macOS) dosyasını çalıştır.

## 2. Projeyi açma ve oynama

1. Godot'u aç, **Import** butonuna bas → bu klasördeki `gravity/project.godot` dosyasını seç.
2. Proje açılınca sağ üstteki **▶ (F5)** butonuna bas.
3. Fareyle oyna: ekranın herhangi bir yerine tıkla, **geriye doğru sürükle**, bırak.
   Sürüklerken tahmini rota noktalarla görünür. `Esc` = menüye dön.

> İlk açılışta Godot projeyi içe aktarır (`.godot/` klasörünü oluşturur), birkaç saniye sürebilir.

## 3. Nasıl oynanır

- Sapan mantığı: geri çek → ters yöne fırla. Çekme uzunluğu = güç (halka göstergesi).
- Kesik çizgi = tahmini rota. Kırmızı **X** = çarpacaksın, yeşil halka = hedefe ulaşacaksın.
- Gezegene çarpmak = **CRASHED**, alandan çıkmak / sonsuz yörünge = **LOST IN SPACE**.
  Gemi otomatik olarak başa döner, önceki denemenin silik izi ekranda kalır.
- Az denemede bitir → daha çok yıldız (1 deneme = 3★, ≤3 = 2★, fazlası = 1★).
- Bölümler ilerledikçe tahmin çizgisi kısalır: önce öğrenirsin, sonra sezgiyle oynarsın.

## 4. Kod yapısı

```
gravity/
├─ project.godot              Ayarlar (720x1280 portrait, mobil uyumlu renderer)
├─ scenes/main.tscn           Tek sahne; geri kalan her şey koddan kuruluyor
├─ shaders/
│  ├─ planet.gdshader         Dönen, ışıklı, atmosferli prosedürel gezegen
│  └─ nebula.gdshader         Arka plan bulutsusu
├─ scripts/
│  ├─ config/tuning.gd        ★ TÜM AYARLANABİLİR PARAMETRELER BURADA
│  ├─ physics/gravity_physics.gd   Fizik motoru (saf matematik, node yok)
│  ├─ levels/level_data.gd    ★ Bölüm tanımları (yeni bölüm = yeni sözlük)
│  ├─ levels/game.gd          Bölüm yöneticisi: kurulum, kazan/kaybet akışı
│  ├─ game/ship.gd            Gemi: uçuş, çizim, sonuç bildirimi
│  ├─ game/launch_input.gd    Dokunmatik/fare sapan kontrolü
│  ├─ game/trajectory_preview.gd  Yörünge tahmini çizimi
│  ├─ game/planet.gd, target.gd, trail.gd, background.gd
│  ├─ game/camera_rig.gd      Ekrana sığdırma, takip, sarsıntı, zoom vuruşu
│  ├─ game/effects.gd         Parçacık patlaması, şok dalgası
│  ├─ ui/                     Ana menü, bölüm seçimi, ayarlar, HUD, tema
│  ├─ autoload/game_state.gd  İlerleme/yıldız/ayar kaydı (user://)
│  └─ autoload/sfx.gd         Kodla sentezlenen sesler
└─ tools/level_check.py       Bölümlerin çözülebilirliğini test eden simülatör
```

**Önemli tasarım kararı:** Gemi uçuşu ve tahmin çizgisi *aynı* fonksiyonu
(`GravityPhysics.step`) *aynı* sabit adımla (1/120 sn) kullanır. Bu yüzden
tahmin edilen rota ile gerçek uçuş birebir aynıdır. Yerçekimi Godot'un fizik
motoruyla değil, kendi hafif hesaplamamızla yapılır: mobilde ucuz ve deterministik.

## 5. Ayar yapmak (kod bilgisi gerekmez)

`scripts/config/tuning.gd` dosyasını aç:

| Parametre | Ne yapar |
|---|---|
| `BASE_MU` | Yerçekimi gücü (büyüt = gezegenler daha çok çeker) |
| `MAX_LAUNCH_SPEED` | Tam güçte fırlatma hızı |
| `MAX_DRAG` | Tam güç için gereken sürükleme mesafesi |
| `MAX_FLIGHT_TIME` | Kaç saniye sonra "kayboldun" sayılır |
| `CAMERA_FOLLOW`, `SHAKE_MAX_OFFSET` | Kamera hissi |
| `THREE_STAR_ATTEMPTS`, `TWO_STAR_ATTEMPTS` | Yıldız kuralları |

Bölüm başına: `level_data.gd` içinde gezegen `mass`, `radius`, `style`
(`terra, desert, ice, lava, gas, moon`), hedef boyutu ve `preview_time`.

Yeni bölüm ekledikten sonra `python3 tools/level_check.py` ile çözülebilir
olduğunu kontrol et (aynı bölümü o dosyadaki listeye de ekle).

## 6. Android'e alma (sonraki adım)

1. Godot'ta **Editor → Manage Export Templates → Download** (bir kerelik).
2. Android Studio / OpenJDK 17 + Android SDK kur; **Editor Settings → Export → Android**
   altında SDK yolunu göster.
3. **Project → Export → Add… → Android**. Permissions bölümünden **Vibrate**'i işaretle
   (titreşim için). **Export Project** ile `.apk` üret ya da telefonu USB ile bağlayıp
   üstteki Android ikonuna basarak doğrudan çalıştır.

Proje zaten mobil için hazırlandı: GL Compatibility renderer, dikey ekran,
her en-boy oranına sığan kamera, dokunmatik dostu büyük butonlar, Android geri tuşu desteği.
