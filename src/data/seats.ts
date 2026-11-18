import type { VenueConfig, TierConfig } from '../config/venue';
import { ovalRadius } from '../core/oval';
import { clamp, mulberry32 } from '../core/rng';

/** Bir katın hesaplanmış yerleşimi (iç ovalden yatay uzaklık d ve yükseklik y). */
export interface TierLayout {
  index: number;
  config: TierConfig;
  d0: number;
  y0: number;
  d1: number;
  y1: number;
}

export interface BlockRow {
  start: number;
  count: number;
}

export interface Block {
  index: number;
  /** Görünen blok numarası, ör. "112". */
  id: string;
  tier: number;
  angle0: number;
  angle1: number;
  angleMid: number;
  /** Bloğun orta noktası (dünya koordinatı). */
  center: [number, number, number];
  color: number;
  seatStart: number;
  seatCount: number;
  rows: BlockRow[];
  /** Tribün adı (yön). */
  side: string;
}

export interface SeatData {
  count: number;
  /** Koltuk tabanı konumu (x,y,z). */
  pos: Float32Array;
  /** Koltuğun baktığı yön (Y ekseni etrafında, yerel +Z sahaya bakar). */
  yaw: Float32Array;
  block: Uint16Array;
  tier: Uint8Array;
  /** 0 tabanlı sıra (0 = sahaya en yakın). */
  row: Uint8Array;
  /** 1 tabanlı koltuk numarası (blok sırası içinde). */
  num: Uint16Array;
  taken: Uint8Array;
  /** Görüş puanı 0-100. */
  score: Uint8Array;
  price: Uint16Array;
  blocks: Block[];
  tiers: TierLayout[];
  priceMin: number;
  priceMax: number;
}

/** Koltukta oturan birinin göz yüksekliği (koltuk tabanından, m). */
export const EYE_HEIGHT = 1.3;

export function layoutTiers(venue: VenueConfig): TierLayout[] {
  const out: TierLayout[] = [];
  let d = 0;
  let y = venue.bowl.firstRowHeight;
  venue.tiers.forEach((config, index) => {
    const d0 = d + config.gap;
    const y0 = y + config.lift;
    const d1 = d0 + config.rows * config.rowDepth;
    const y1 = y0 + config.rows * config.rowRise;
    out.push({ index, config, d0, y0, d1, y1 });
    d = d1;
    y = y1;
  });
  return out;
}

/** Stadyumun en dış yarıçap ofseti (cephe). */
export function outerOffset(venue: VenueConfig, tiers: TierLayout[]): number {
  return tiers[tiers.length - 1].d1 + venue.facade.offset;
}

function sideName(angle: number): string {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  if (Math.abs(s) > Math.abs(c) * 0.85) return s > 0 ? 'Güney Tribünü' : 'Kuzey Tribünü';
  return c > 0 ? 'Doğu Kale Arkası' : 'Batı Kale Arkası';
}

/**
 * Görüş puanı: uydurma değil, geometriden hesaplanır.
 *  - yakınlık  (%50): göz noktasının saha merkezine uzaklığı (40 m → 1, 165 m → 0)
 *  - yükseklik (%20): sahaya bakış açısı; ~14° ve üstü tam puan, düz bakış düşük
 *  - yan açı   (%30): orta saha hizası 1, kale arkası 0.35
 */
export function viewScore(x: number, y: number, z: number): number {
  const ey = y + EYE_HEIGHT;
  const horiz = Math.hypot(x, z);
  const dist = Math.hypot(horiz, ey);
  const proximity = clamp(1 - (dist - 40) / 125, 0, 1);
  const elevDeg = (Math.atan2(ey, horiz) * 180) / Math.PI;
  const elevation = Math.sqrt(clamp(elevDeg / 14, 0, 1));
  const sideness = 0.35 + 0.65 * Math.abs(z / (horiz || 1));
  return Math.round(100 * (0.5 * proximity + 0.2 * elevation + 0.3 * sideness));
}

export function generateSeats(venue: VenueConfig): SeatData {
  const { a, b, exponent: n } = venue.bowl;
  const tiers = layoutTiers(venue);
  const rng = mulberry32(venue.seed);
  const SUB = 40;

  const pos: number[] = [];
  const yaw: number[] = [];
  const blockIdx: number[] = [];
  const tierIdx: number[] = [];
  const rowIdx: number[] = [];
  const num: number[] = [];
  const blocks: Block[] = [];

  const px = new Float64Array(SUB + 1);
  const pz = new Float64Array(SUB + 1);
  const cum = new Float64Array(SUB + 1);

  for (const tier of tiers) {
    const cfg = tier.config;
    // Blok sınırları: katın orta sırasının ovalinde eşit yay uzunluğu → kutupsal açı.
    const dm = (tier.d0 + tier.d1) / 2;
    const N = 2880;
    const arc = new Float64Array(N + 1);
    let lx = ovalRadius(a + dm, b + dm, n, 0);
    let lz = 0;
    for (let i = 1; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      const r = ovalRadius(a + dm, b + dm, n, th);
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      arc[i] = arc[i - 1] + Math.hypot(x - lx, z - lz);
      lx = x;
      lz = z;
    }
    const total = arc[N];
    const angleAt = (s: number): number => {
      s = ((s % total) + total) % total;
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (arc[mid] <= s) lo = mid;
        else hi = mid;
      }
      const f = (s - arc[lo]) / (arc[hi] - arc[lo] || 1);
      return ((lo + f) / N) * Math.PI * 2;
    };

    for (let k = 0; k < cfg.blocks; k++) {
      // Yarım blok kaydırma: 1 numaralı blok doğu kale arkasında ortalanır.
      let a0 = angleAt(((k - 0.5) / cfg.blocks) * total);
      const a1 = angleAt(((k + 0.5) / cfg.blocks) * total);
      if (a0 > a1) a0 -= Math.PI * 2;
      const mid = (a0 + a1) / 2;
      const block: Block = {
        index: blocks.length,
        id: `${cfg.code}${String(k + 1).padStart(2, '0')}`,
        tier: tier.index,
        angle0: a0,
        angle1: a1,
        angleMid: mid,
        center: [0, 0, 0],
        color: parseInt(venue.blockColors[(k + tier.index) % venue.blockColors.length].slice(1), 16),
        seatStart: pos.length / 3,
        seatCount: 0,
        rows: [],
        side: sideName(mid),
      };
      for (let r = 0; r < cfg.rows; r++) {
        const d = tier.d0 + (r + 0.5) * cfg.rowDepth;
        const y = tier.y0 + r * cfg.rowRise;
        for (let i = 0; i <= SUB; i++) {
          const th = a0 + ((a1 - a0) * i) / SUB;
          const rad = ovalRadius(a + d, b + d, n, th);
          px[i] = Math.cos(th) * rad;
          pz[i] = Math.sin(th) * rad;
          cum[i] = i === 0 ? 0 : cum[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]);
        }
        const len = cum[SUB];
        const count = Math.max(0, Math.floor((len - venue.seat.aisle) / venue.seat.spacing));
        const startS = (len - (count - 1) * venue.seat.spacing) / 2;
        const rowStart = pos.length / 3;
        let seg = 0;
        for (let c = 0; c < count; c++) {
          const s = startS + c * venue.seat.spacing;
          while (seg < SUB - 1 && cum[seg + 1] < s) seg++;
          const f = (s - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
          const x = px[seg] + (px[seg + 1] - px[seg]) * f;
          const z = pz[seg] + (pz[seg + 1] - pz[seg]) * f;
          // İçe bakan normal: teğete dik, merkeze dönük.
          const tx = px[seg + 1] - px[seg];
          const tz = pz[seg + 1] - pz[seg];
          let nx = -tz;
          let nz = tx;
          if (nx * -x + nz * -z < 0) {
            nx = -nx;
            nz = -nz;
          }
          pos.push(x, y, z);
          yaw.push(Math.atan2(nx, nz));
          blockIdx.push(block.index);
          tierIdx.push(tier.index);
          rowIdx.push(r);
          num.push(c + 1);
        }
        block.rows.push({ start: rowStart, count });
      }
      block.seatCount = pos.length / 3 - block.seatStart;
      const dc = (tier.d0 + tier.d1) / 2;
      const rc = ovalRadius(a + dc, b + dc, n, mid);
      block.center = [Math.cos(mid) * rc, (tier.y0 + tier.y1) / 2, Math.sin(mid) * rc];
      blocks.push(block);
    }
  }

  const count = pos.length / 3;
  const data: SeatData = {
    count,
    pos: new Float32Array(pos),
    yaw: new Float32Array(yaw),
    block: new Uint16Array(blockIdx),
    tier: new Uint8Array(tierIdx),
    row: new Uint8Array(rowIdx),
    num: new Uint16Array(num),
    taken: new Uint8Array(count),
    score: new Uint8Array(count),
    price: new Uint16Array(count),
    blocks,
    tiers,
    priceMin: Infinity,
    priceMax: -Infinity,
  };

  // Puan, fiyat (kat aralığında, puana göre) ve doluluk.
  const tMin = tiers.map(() => 101);
  const tMax = tiers.map(() => -1);
  for (let i = 0; i < count; i++) {
    const s = viewScore(data.pos[i * 3], data.pos[i * 3 + 1], data.pos[i * 3 + 2]);
    data.score[i] = s;
    const t = data.tier[i];
    if (s < tMin[t]) tMin[t] = s;
    if (s > tMax[t]) tMax[t] = s;
  }
  for (let i = 0; i < count; i++) {
    const t = data.tier[i];
    const cfg = tiers[t].config;
    const f = (data.score[i] - tMin[t]) / Math.max(1, tMax[t] - tMin[t]);
    const price = Math.round(cfg.priceMin + (cfg.priceMax - cfg.priceMin) * f);
    data.price[i] = price;
    if (price < data.priceMin) data.priceMin = price;
    if (price > data.priceMax) data.priceMax = price;
    data.taken[i] = rng() < venue.occupancy ? 1 : 0;
  }
  return data;
}

/** "112-14-23" biçiminde paylaşılabilir koltuk kimliği. */
export function seatId(data: SeatData, i: number): string {
  return `${data.blocks[data.block[i]].id}-${data.row[i] + 1}-${data.num[i]}`;
}

export function findSeatById(data: SeatData, id: string): number {
  const m = /^(\d{3})-(\d{1,3})-(\d{1,4})$/.exec(id.trim());
  if (!m) return -1;
  const block = data.blocks.find((bl) => bl.id === m[1]);
  if (!block) return -1;
  const row = block.rows[parseInt(m[2], 10) - 1];
  const n = parseInt(m[3], 10);
  if (!row || n < 1 || n > row.count) return -1;
  return row.start + n - 1;
}

/** Aynı sıradaki en yakın boş koltuk (yoksa -1). */
export function nearestFreeInRow(data: SeatData, i: number, isFree: (s: number) => boolean): number {
  const row = data.blocks[data.block[i]].rows[data.row[i]];
  for (let off = 1; off < row.count; off++) {
    const l = i - off;
    const r = i + off;
    if (l >= row.start && isFree(l)) return l;
    if (r < row.start + row.count && isFree(r)) return r;
  }
  return -1;
}

/**
 * Komşu koltuk: dx = ±1 aynı sırada (blok sınırını aşarsa komşu bloğa geçer),
 * dy = ±1 ön/arka sıra (kat sınırında durur).
 */
export function neighborSeat(data: SeatData, i: number, dx: number, dy: number): number {
  const block = data.blocks[data.block[i]];
  const r = data.row[i];
  const row = block.rows[r];
  if (dx !== 0) {
    const j = i + dx;
    if (j >= row.start && j < row.start + row.count) return j;
    const tierBlocks = data.blocks.filter((bl) => bl.tier === block.tier);
    const k = tierBlocks.indexOf(block);
    const nb = tierBlocks[(k + dx + tierBlocks.length) % tierBlocks.length];
    const nrow = nb.rows[r];
    if (!nrow || nrow.count === 0) return -1;
    return dx > 0 ? nrow.start : nrow.start + nrow.count - 1;
  }
  if (dy !== 0) {
    const nrow = block.rows[r + dy];
    if (!nrow || nrow.count === 0) return -1;
    const f = row.count > 1 ? (i - row.start) / (row.count - 1) : 0.5;
    return nrow.start + Math.round(f * (nrow.count - 1));
  }
  return -1;
}
