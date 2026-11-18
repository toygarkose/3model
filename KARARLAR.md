# KARARLAR

Belirsiz noktalarda verilen kararlar (tek satır).

- Ürün adı **SEYİR**; logo: oval tribün halkası + sarı koltuk noktası (inline SVG).
- Repodaki `mercedes_benz_v_class.glb` bu ürünle ilgisiz; silinmedi, kullanılmadı.
- Stadyum ovali süper-elips (üs 2.6): dikdörtgen sahayı elipsten daha yakın sarar.
- Koltuklar blok başına bir InstancedMesh: blok bazlı frustum culling ve hızlı raycast için.
- Çatı yarı saydam: kuşbakışında üst kat koltukları görülebilsin ve tıklanabilsin.
- Koltukların %30'u satılmış ("dolu") veridir; koltuk görünümünde tribün "maç günü önizlemesi" olarak ~%90 dolu gösterilir (karşı tribünler dolu görünsün), orbit'te yalnızca satılmış koltuklarda seyirci var.
- Uzak bloklar blok başına tek birleştirilmiş geometriyle (LOD), yakın bloklar InstancedMesh ile çizilir; raycast her zaman InstancedMesh + instanceId kullanır.
- Koltuk görünümündeyken başka koltuğa tıklama yok (yanlış seçim olmasın); geçiş ok tuşları/butonlarla, "Stadyuma dön" ile çıkılır.
- Tepkiler (alkış, tezahürat, dalga) koltuk görünümündeyken, kameranın oturduğu blokta çalışır; bilet şartı yok.
- Filtre dışı (soluk) koltuklar seçilemez; tıklanınca kısa bilgi mesajı çıkar.
- Oyuncular 1.3x, top ~3x ölçekli ve topun altında beyaz halka var: tribünden takip edilebilsin.
- Maç 90 dakikayı 240 sn'de oynar; varsayılan geri sayım 75 sn, Demo düğmesi 3 sn'ye indirir.
- WebSocket yalnızca `?ws=ws://host:8787` verilirse denenir (sunucu yokken konsol hatası olmasın).
- Seçili koltuk URL hash'ine yazılır: `#koltuk=112-14-23&etkinlik=mac` (tek dosyalık derlemede de çalışsın diye hash).
- En fazla 6 bilet tutulur; "Koltuğu bırak" ile iade edilir. Ödeme yok.
- Görüş puanı = 100 × (0.5·yakınlık + 0.2·yükseklik açısı + 0.3·yan açı); fiyat kat aralığı içinde puanla orantılı.
- Varsayılan içerik etkinliği: maç. Sahne modunda stadyum ışıkları kısılır, müzik Web Audio ile sentezlenir.
