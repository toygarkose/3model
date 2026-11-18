/**
 * Mekan yapılandırması. Stadyumun bütün ölçüleri, katları, blokları, renkleri,
 * fiyatları ve etkinlik bilgileri buradan gelir. Farklı bir mekan üretmek için
 * bu dosyanın bir kopyasını düzenleyip `ACTIVE_VENUE` olarak dışa aktarmak yeterlidir.
 */
export interface TierConfig {
  key: string;
  /** Arayüzde görünen kat adı. */
  name: string;
  /** Blok numarasının yüzler basamağı: 1 → 1xx. */
  code: number;
  rows: number;
  /** Sıra derinliği (m). */
  rowDepth: number;
  /** Sıra başına yükselme (m). */
  rowRise: number;
  /** Önceki katın arka kenarından yatay boşluk (m). */
  gap: number;
  /** Önceki katın tepesinden dikey yükselme (m). */
  lift: number;
  blocks: number;
  priceMin: number;
  priceMax: number;
  perks: [string, string, string];
}

export interface TeamConfig {
  name: string;
  short: string;
  color: string;
  accent: string;
}

export interface VenueConfig {
  name: string;
  city: string;
  currency: string;
  field: { length: number; width: number };
  /** İlk sıranın oturduğu iç oval. */
  bowl: { a: number; b: number; exponent: number; firstRowHeight: number };
  seat: { spacing: number; aisle: number };
  tiers: TierConfig[];
  /** Blok renk döngüsü (pastel). */
  blockColors: string[];
  occupancy: number;
  seed: number;
  facade: { offset: number; height: number };
  events: {
    match: { badge: string; home: TeamConfig; away: TeamConfig; date: string; time: string; competition: string };
    stage: { badge: string; artist: string; tour: string; date: string; time: string };
  };
  /** Canlı evre süresi (sn) ve varsayılan geri sayım (sn). */
  flow: { liveSeconds: number; countdownSeconds: number; demoCountdownSeconds: number };
}

export const SEYIR_ARENA: VenueConfig = {
  name: 'Seyir Arena',
  city: 'İstanbul',
  currency: 'EUR',
  field: { length: 105, width: 68 },
  bowl: { a: 67, b: 49, exponent: 2.6, firstRowHeight: 1.6 },
  seat: { spacing: 0.58, aisle: 1.5 },
  tiers: [
    {
      key: 'lower', name: 'Alt Kat', code: 1, rows: 22, rowDepth: 0.85, rowRise: 0.4, gap: 0, lift: 0,
      blocks: 20, priceMin: 160, priceMax: 170,
      perks: ['Yastıklı koltuk', 'Sahaya en yakın sıralar', 'Yiyecek-içecek kuponu'],
    },
    {
      key: 'club', name: 'Orta Kat · Club', code: 2, rows: 8, rowDepth: 0.9, rowRise: 0.5, gap: 1.6, lift: 2.9,
      blocks: 20, priceMin: 170, priceMax: 180,
      perks: ['Lounge erişimi', 'Devre arası servis', 'Geniş koltuk'],
    },
    {
      key: 'upper', name: 'Üst Kat', code: 3, rows: 20, rowDepth: 0.85, rowRise: 0.62, gap: 1.8, lift: 3.4,
      blocks: 24, priceMin: 60, priceMax: 70,
      perks: ['Tüm sahayı görme', 'Uygun fiyat', 'Hızlı giriş-çıkış'],
    },
  ],
  blockColors: ['#f7a8c8', '#b9a2f2', '#f6dc7a', '#9be3c4'],
  occupancy: 0.3,
  seed: 20261118,
  facade: { offset: 4, height: 37 },
  events: {
    match: {
      badge: 'MAÇ',
      home: { name: 'Boğaz Spor', short: 'BOĞ', color: '#e63946', accent: '#ffffff' },
      away: { name: 'Anka FK', short: 'ANK', color: '#2f6bff', accent: '#ffd23f' },
      date: '21 Kasım 2026',
      time: '20:45',
      competition: 'Lig · 12. Hafta',
    },
    stage: {
      badge: 'KONSER',
      artist: 'NOVA',
      tour: 'Mavi Gece Turnesi',
      date: '28 Kasım 2026',
      time: '21:00',
    },
  },
  flow: { liveSeconds: 240, countdownSeconds: 75, demoCountdownSeconds: 3 },
};

export const ACTIVE_VENUE: VenueConfig = SEYIR_ARENA;
