import type { VenueConfig } from '../config/venue';
import { ovalRadius } from '../core/oval';
import { outerOffset, type Block, type SeatData } from '../data/seats';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

function ovalPath(venue: VenueConfig, d: number): string {
  const { a, b, exponent: n } = venue.bowl;
  let s = '';
  for (let i = 0; i <= 72; i++) {
    const th = (i / 72) * Math.PI * 2;
    const r = ovalRadius(a + d, b + d, n, th);
    s += `${i === 0 ? 'M' : 'L'}${(Math.cos(th) * r).toFixed(1)} ${(Math.sin(th) * r).toFixed(1)}`;
  }
  return `${s}Z`;
}

/** Sağ üst kart: renkli blok halkası. Bloğa tıklayınca kamera o bloğa döner. */
export class BlockMap {
  private readonly paths: SVGPathElement[] = [];
  private readonly label: SVGGElement;
  private readonly labelText: SVGTextElement;
  private readonly marker: SVGCircleElement;
  private readonly mine: SVGGElement;
  private kb = -1;
  private selected = -1;

  constructor(
    private readonly svg: SVGSVGElement,
    venue: VenueConfig,
    private readonly data: SeatData,
    onPick: (block: Block) => void,
  ) {
    const { a, b, exponent: n } = venue.bowl;
    const { length: L, width: W } = venue.field;
    svg.setAttribute('viewBox', '-126 -108 252 216');
    svg.append(el('rect', { class: 'pitch', x: -L / 2, y: -W / 2, width: L, height: W, rx: 3 }));
    svg.append(el('path', { d: `M0 ${-W / 2}V${W / 2}`, stroke: '#14142b', 'stroke-width': 1, fill: 'none' }));
    svg.append(el('circle', { cx: 0, cy: 0, r: 9, stroke: '#14142b', 'stroke-width': 1, fill: 'none' }));
    for (const block of data.blocks) {
      const tier = data.tiers[block.tier];
      const pad = 0.006;
      const pts: string[] = [];
      const steps = 6;
      for (let i = 0; i <= steps; i++) {
        const th = block.angle0 + pad + ((block.angle1 - block.angle0 - pad * 2) * i) / steps;
        const r = ovalRadius(a + tier.d1, b + tier.d1, n, th);
        pts.push(`${(Math.cos(th) * r).toFixed(1)} ${(Math.sin(th) * r).toFixed(1)}`);
      }
      for (let i = steps; i >= 0; i--) {
        const th = block.angle0 + pad + ((block.angle1 - block.angle0 - pad * 2) * i) / steps;
        const r = ovalRadius(a + tier.d0 + 0.6, b + tier.d0 + 0.6, n, th);
        pts.push(`${(Math.cos(th) * r).toFixed(1)} ${(Math.sin(th) * r).toFixed(1)}`);
      }
      const path = el('path', { d: `M${pts.join('L')}Z`, fill: hex(block.color), 'data-block': block.index });
      const title = el('title', {});
      title.textContent = `Blok ${block.id} · ${tier.config.name}`;
      path.append(title);
      path.addEventListener('click', () => onPick(block));
      this.paths.push(path);
      svg.append(path);
    }
    this.mine = el('g', {});
    svg.append(this.mine);
    this.marker = el('circle', { r: 5, fill: '#ffd23f', stroke: '#14142b', 'stroke-width': 2.4, visibility: 'hidden' });
    this.marker.style.transition = 'transform 0.7s cubic-bezier(.4,0,.2,1)';
    svg.append(this.marker);
    this.label = el('g', { visibility: 'hidden' });
    this.label.style.transition = 'transform 0.7s cubic-bezier(.4,0,.2,1)';
    this.label.append(el('rect', { x: -17, y: -29, width: 34, height: 17, rx: 4, fill: '#fff', stroke: '#14142b', 'stroke-width': 2 }));
    this.labelText = el('text', { x: 0, y: -16.5, 'text-anchor': 'middle', 'font-size': 12, fill: '#14142b' });
    this.label.append(this.labelText);
    svg.append(this.label);

    // Klavye: oklarla blok gez, Enter ile kamerayı çevir
    svg.addEventListener('keydown', (e) => {
      const blocks = data.blocks;
      if (this.kb < 0) this.kb = this.selected >= 0 ? this.selected : 0;
      const cur = blocks[this.kb];
      const same = blocks.filter((bl) => bl.tier === cur.tier);
      const k = same.indexOf(cur);
      if (e.key === 'ArrowRight') this.kb = same[(k + 1) % same.length].index;
      else if (e.key === 'ArrowLeft') this.kb = same[(k - 1 + same.length) % same.length].index;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const t = cur.tier + (e.key === 'ArrowUp' ? 1 : -1);
        const cand = blocks.filter((bl) => bl.tier === t);
        if (cand.length) {
          cand.sort((p, q) => Math.abs(Math.sin((p.angleMid - cur.angleMid) / 2)) - Math.abs(Math.sin((q.angleMid - cur.angleMid) / 2)));
          this.kb = cand[0].index;
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        onPick(blocks[this.kb]);
      } else return;
      e.preventDefault();
      e.stopPropagation();
      this.paths.forEach((p, i) => p.classList.toggle('kb', i === this.kb));
      this.svg.setAttribute('aria-label', `Blok ${blocks[this.kb].id} odakta. Enter ile kamerayı çevir.`);
    });
    svg.addEventListener('blur', () => {
      this.kb = -1;
      this.paths.forEach((p) => p.classList.remove('kb'));
    });
  }

  /** Seçili koltuk: blok numarası etiketi ve işaretçi yeni konuma kayar. */
  setSeat(seat: number): void {
    const prev = this.selected;
    if (seat < 0) {
      this.selected = -1;
      this.marker.setAttribute('visibility', 'hidden');
      this.label.setAttribute('visibility', 'hidden');
    } else {
      const x = this.data.pos[seat * 3];
      const z = this.data.pos[seat * 3 + 2];
      const block = this.data.blocks[this.data.block[seat]];
      this.selected = block.index;
      this.marker.setAttribute('visibility', 'visible');
      this.label.setAttribute('visibility', 'visible');
      this.marker.style.transform = `translate(${x.toFixed(1)}px, ${z.toFixed(1)}px)`;
      this.label.style.transform = `translate(${x.toFixed(1)}px, ${(z < -60 ? z + 44 : z).toFixed(1)}px)`;
      this.labelText.textContent = block.id;
    }
    if (prev >= 0) this.paths[prev].classList.remove('sel');
    if (this.selected >= 0) this.paths[this.selected].classList.add('sel');
  }

  setMine(seats: number[]): void {
    this.mine.replaceChildren(
      ...seats.map((s) => el('circle', { cx: this.data.pos[s * 3], cy: this.data.pos[s * 3 + 2], r: 4.2, fill: '#2f6bff', stroke: '#14142b', 'stroke-width': 2 })),
    );
  }

  setTierFilter(tier: number): void {
    this.data.blocks.forEach((bl, i) => this.paths[i].classList.toggle('dim', tier >= 0 && bl.tier !== tier));
  }
}

/** Sol alt kart: kuşbakışı mini harita, kamera konumu ve bakış yönü. */
export class CameraMap {
  private readonly cam: SVGGElement;
  private readonly range = 300;

  constructor(svg: SVGSVGElement, venue: VenueConfig, data: SeatData) {
    const outer = outerOffset(venue, data.tiers);
    const { length: L, width: W } = venue.field;
    const r = this.range;
    svg.setAttribute('viewBox', `${-r} ${-r * 0.72} ${r * 2} ${r * 1.44}`);
    svg.append(el('path', { d: ovalPath(venue, outer), fill: '#b9a2f2', stroke: '#14142b', 'stroke-width': 5 }));
    svg.append(el('path', { d: ovalPath(venue, 0), fill: '#1a4a36', stroke: '#14142b', 'stroke-width': 4 }));
    svg.append(el('rect', { x: -L / 2, y: -W / 2, width: L, height: W, fill: '#3d9a57', stroke: '#f6efdd', 'stroke-width': 3 }));
    this.cam = el('g', {});
    this.cam.append(el('path', { d: 'M0 0L-52 -150A160 160 0 0 1 52 -150Z', fill: 'rgba(255,210,63,0.32)', stroke: '#ffd23f', 'stroke-width': 3 }));
    this.cam.append(el('circle', { r: 15, fill: '#ffd23f', stroke: '#14142b', 'stroke-width': 5 }));
    svg.append(this.cam);
  }

  update(x: number, z: number, dirX: number, dirZ: number): void {
    const r = this.range;
    // Kamera harita dışına taşarsa kenarda tutulur
    const k = Math.max(1, Math.abs(x) / (r - 22), Math.abs(z) / (r * 0.72 - 22));
    const deg = (Math.atan2(dirX, -dirZ) * 180) / Math.PI;
    this.cam.setAttribute('transform', `translate(${(x / k).toFixed(1)} ${(z / k).toFixed(1)}) rotate(${deg.toFixed(1)})`);
  }
}
