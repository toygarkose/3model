/**
 * Eş zamanlılık: iki katman.
 *  1) Varsayılan, sunucusuz: aynı tarayıcıdaki sekmeler BroadcastChannel ile konuşur.
 *  2) İsteğe bağlı: `?ws=ws://host:8787` verilirse küçük Node WebSocket sunucusu
 *     (`npm run server`) farklı cihazları bağlar. Sunucu yoksa uygulama aynen çalışır.
 */
export type ReactionKind = 'applause' | 'cheer' | 'wave';

export type NetMessage =
  | { type: 'presence'; id: string; seat: string | null; event: string; claims: string[] }
  | { type: 'reaction'; id: string; kind: ReactionKind; block: number }
  | { type: 'hello'; id: string }
  | { type: 'bye'; id: string };

export interface Peer {
  id: string;
  seat: string | null;
  claims: string[];
  lastSeen: number;
}

export interface SyncHooks {
  peersChanged(peers: Peer[]): void;
  reaction(kind: ReactionKind, block: number): void;
  linkChanged(link: 'local' | 'ws'): void;
  /** Kendi durumumuz (heartbeat için). */
  self(): { seat: string | null; event: string; claims: string[] };
}

const HEARTBEAT_MS = 3000;
const PEER_TIMEOUT_MS = 9000;

export class Sync {
  readonly id: string;
  private channel: BroadcastChannel | null = null;
  private socket: WebSocket | null = null;
  private peers = new Map<string, Peer>();
  private timer: number | null = null;
  private retry: number | null = null;
  private closed = false;

  constructor(private readonly hooks: SyncHooks) {
    this.id = Math.random().toString(36).slice(2, 10);
    try {
      this.channel = new BroadcastChannel('seyir-stadyum-v1');
      this.channel.onmessage = (e) => this.receive(e.data as NetMessage);
    } catch {
      this.channel = null; // file:// gibi opak kökenlerde olmayabilir
    }
    const wsUrl = new URLSearchParams(location.search).get('ws');
    if (wsUrl && /^wss?:\/\//.test(wsUrl)) this.connect(wsUrl);
    this.timer = window.setInterval(() => this.beat(), HEARTBEAT_MS);
    window.addEventListener('pagehide', this.onHide);
    this.send({ type: 'hello', id: this.id });
    this.beat();
  }

  private onHide = (): void => {
    this.send({ type: 'bye', id: this.id });
  };

  private connect(url: string): void {
    if (this.closed) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.hooks.linkChanged('ws');
      this.send({ type: 'hello', id: this.id });
      this.beat();
    };
    socket.onmessage = (e) => {
      try {
        this.receive(JSON.parse(String(e.data)) as NetMessage);
      } catch {
        /* bozuk mesajı yok say */
      }
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.hooks.linkChanged('local');
      if (!this.closed) this.retry = window.setTimeout(() => this.connect(url), 5000);
    };
    socket.onerror = () => socket.close();
  }

  private send(msg: NetMessage): void {
    try {
      this.channel?.postMessage(msg);
    } catch {
      /* kanal kapalı */
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  private receive(msg: NetMessage): void {
    if (!msg || typeof msg !== 'object' || msg.id === this.id) return;
    switch (msg.type) {
      case 'hello':
        this.beat();
        break;
      case 'presence': {
        const known = this.peers.get(msg.id);
        const changed = !known || known.seat !== msg.seat || known.claims.join() !== (msg.claims ?? []).join();
        this.peers.set(msg.id, { id: msg.id, seat: msg.seat, claims: Array.isArray(msg.claims) ? msg.claims.slice(0, 12) : [], lastSeen: Date.now() });
        if (changed) this.emitPeers();
        break;
      }
      case 'reaction':
        if (Number.isInteger(msg.block)) this.hooks.reaction(msg.kind, msg.block);
        break;
      case 'bye':
        if (this.peers.delete(msg.id)) this.emitPeers();
        break;
    }
  }

  private emitPeers(): void {
    this.hooks.peersChanged([...this.peers.values()]);
  }

  /** Durumumuzu yayınla, zaman aşımına uğrayanları düşür. */
  beat(): void {
    const self = this.hooks.self();
    this.send({ type: 'presence', id: this.id, seat: self.seat, event: self.event, claims: self.claims });
    const now = Date.now();
    let dropped = false;
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > PEER_TIMEOUT_MS) {
        this.peers.delete(id);
        dropped = true;
      }
    }
    if (dropped) this.emitPeers();
  }

  react(kind: ReactionKind, block: number): void {
    this.send({ type: 'reaction', id: this.id, kind, block });
  }

  dispose(): void {
    this.closed = true;
    this.onHide();
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.retry !== null) window.clearTimeout(this.retry);
    window.removeEventListener('pagehide', this.onHide);
    this.channel?.close();
    this.socket?.close();
  }
}
