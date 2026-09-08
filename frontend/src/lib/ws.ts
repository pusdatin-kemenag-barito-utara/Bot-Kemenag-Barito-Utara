export interface WaStatusData {
  status: string;
}

export interface QrEventData {
  codes?: string[];
}

export interface WsInit {
  status?: string;
  qr?: string[];
}

export type BotState =
  | { kind: 'connected' }
  | { kind: 'connecting' }
  | { kind: 'qr'; codes: string[] }
  | { kind: 'disconnected' }
  | { kind: 'logged_out' }
  | { kind: 'unknown' };

export function stateLabel(state: BotState): { text: string; cls: string } {
  switch (state.kind) {
    case 'connected':
      return { text: 'Terhubung', cls: 'connected' };
    case 'connecting':
      return { text: 'Menghubungkan...', cls: '' };
    case 'qr':
      return { text: 'Menunggu Scan QR', cls: '' };
    case 'disconnected':
      return { text: 'Terputus', cls: 'disconnected' };
    case 'logged_out':
      return { text: 'Sesi Diakhiri', cls: 'disconnected' };
    default:
      return { text: 'Menghubungkan...', cls: '' };
  }
}

let listeners = new Set<() => void>();
let conn: WebSocket | null = null;
let retry = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const botState: { value: BotState } = { value: { kind: 'unknown' } };
const lastEvent: { value: unknown } = { value: null };

function setState(next: BotState) {
  if (next.kind === 'unknown' && botState.value.kind === 'unknown') return;
  botState.value = next;
  listeners.forEach((l) => l());
}

function connect() {
  if (conn && (conn.readyState === WebSocket.OPEN || conn.readyState === WebSocket.CONNECTING)) return;
  const proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  conn = new WebSocket(`${proto}${window.location.host}/ws`);

  conn.onopen = () => {
    retry = 0;
    setState({ kind: 'connecting' });
  };

  conn.onmessage = (msg) => {
    try {
      const envelope = JSON.parse(msg.data as string) as { event: string; data: unknown };
      lastEvent.value = envelope;
      const data = envelope.data as Record<string, unknown>;

      switch (envelope.event) {
        case 'init': {
          const init = data as WsInit;
          if (init.qr && init.qr.length > 0) setState({ kind: 'qr', codes: init.qr });
          else if (init.status) mapStatus(String(init.status));
          break;
        }
        case 'status':
          mapStatus(String(data.status ?? 'unknown'));
          break;
        case 'wa_event': {
          // events.QR dari whatsmeow membawa field `codes`.
          const codes = (envelope.data as QrEventData)?.codes;
          if (Array.isArray(codes) && codes.length > 0) setState({ kind: 'qr', codes });
          break;
        }
        default:
          break;
      }
      listeners.forEach((l) => l());
    } catch {
      /* abaikan pesan non-JSON */
    }
  };

  conn.onclose = () => {
    conn = null;
    setState({ kind: 'disconnected' });
    retry += 1;
    const delay = Math.min(1000 * 2 ** retry, 30000);
    reconnectTimer = setTimeout(connect, delay);
  };

  conn.onerror = () => {
    conn?.close();
  };
}

function mapStatus(s: string) {
  switch (s) {
    case 'connected':
      setState({ kind: 'connected' });
      break;
    case 'connecting':
      setState({ kind: 'connecting' });
      break;
    case 'qr':
    case 'waiting_for_qr':
      // status qr tanpa codes → tetap tampilkan pill; codes datang via wa_event
      break;
    case 'disconnected':
      setState({ kind: 'disconnected' });
      break;
    case 'logged_out':
      setState({ kind: 'logged_out' });
      break;
    default:
      setState({ kind: 'unknown' });
  }
}

export function subscribeBot(fn: () => void): () => void {
  listeners.add(fn);
  if (!conn) connect();
  return () => {
    listeners.delete(fn);
  };
}

export function getBotState(): BotState {
  return botState.value;
}

export function getLastEvent(): unknown {
  return lastEvent.value;
}

export function closeBotSocket() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (conn) {
    conn.onclose = null;
    conn.close();
    conn = null;
  }
  listeners = new Set();
}