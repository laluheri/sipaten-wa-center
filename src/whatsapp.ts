import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import path from "node:path";
import { rm } from "node:fs/promises";

export type SessionStatus = "idle" | "connecting" | "qr" | "connected" | "disconnected";

export interface SessionState {
  id: string;
  status: SessionStatus;
  qrDataUrl?: string;
  phone?: string;
  name?: string;
  message?: string;
}

type StateListener = (state: SessionState) => void;

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

export class WhatsAppSession {
  private socket?: WASocket;
  private reconnectTimer?: NodeJS.Timeout;
  private manuallyStopped = false;
  private starting = false;
  private state: SessionState;

  constructor(
    readonly id: string,
    private readonly sessionsDir: string,
    private readonly emitState: StateListener,
    private readonly storageKey = id,
  ) {
    this.state = { id, status: "idle" };
  }

  getState(): SessionState {
    return { ...this.state };
  }

  async sendText(phone: string, text: string) {
    if (!this.socket || this.state.status !== "connected") {
      throw new Error("WhatsApp belum terhubung.");
    }

    const normalizedPhone = phone.replace(/\D/g, "").replace(/^0/, "62");
    if (!/^62\d{8,13}$/.test(normalizedPhone)) {
      throw new Error("Nomor harus memakai format 62, contoh 628123456789.");
    }
    const cleanText = text.trim();
    if (!cleanText || cleanText.length > 4096) {
      throw new Error("Pesan wajib diisi dan maksimal 4096 karakter.");
    }

    const jid = `${normalizedPhone}@s.whatsapp.net`;
    const results = await this.socket.onWhatsApp(jid);
    const result = results?.[0];
    if (!result?.exists) {
      throw new Error("Nomor tersebut tidak terdaftar di WhatsApp.");
    }

    const sent = await this.socket.sendMessage(jid, { text: cleanText });
    return { id: sent?.key.id, phone: normalizedPhone };
  }

  private update(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.emitState(this.getState());
  }

  async connect() {
    if (this.starting || this.socket || this.state.status === "connected") return;

    this.starting = true;
    this.manuallyStopped = false;
    clearTimeout(this.reconnectTimer);
    this.update({ status: "connecting", qrDataUrl: undefined, message: "Menyiapkan koneksi…" });

    try {
      const authFolder = path.join(this.sessionsDir, this.storageKey);
      const { state, saveCreds } = await useMultiFileAuthState(authFolder);

      const socket = makeWASocket({
        auth: state,
        browser: Browsers.ubuntu("WA Center"),
        logger,
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });
      this.socket = socket;
      socket.ev.on("creds.update", saveCreds);

      socket.ev.on("connection.update", async (update) => {
      if (socket !== this.socket) return;

      if (update.qr) {
        const qrDataUrl = await QRCode.toDataURL(update.qr, { width: 360, margin: 2 });
        this.update({ status: "qr", qrDataUrl, message: "Pindai QR melalui WhatsApp di ponsel." });
      }

      if (update.connection === "open") {
        const user = socket.user;
        this.update({
          status: "connected",
          qrDataUrl: undefined,
          phone: user?.id?.split(":")[0],
          name: user?.name,
          message: "Perangkat terhubung.",
        });
      }

      if (update.connection === "close") {
        const statusCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        this.socket = undefined;

        if (loggedOut || this.manuallyStopped) {
          this.update({
            status: "disconnected",
            qrDataUrl: undefined,
            phone: undefined,
            name: undefined,
            message: loggedOut ? "Sesi keluar dari WhatsApp. Hubungkan kembali." : "Perangkat diputuskan.",
          });
          return;
        }

        this.update({ status: "connecting", qrDataUrl: undefined, message: "Koneksi terputus. Mencoba kembali…" });
        this.reconnectTimer = setTimeout(() => void this.connect(), 3000);
      }
      });
    } finally {
      this.starting = false;
    }
  }

  async disconnect() {
    this.manuallyStopped = true;
    clearTimeout(this.reconnectTimer);
    const socket = this.socket;
    this.socket = undefined;
    try {
      await socket?.logout();
    } catch {
      socket?.end(undefined);
    }
    await rm(path.join(this.sessionsDir, this.storageKey), { recursive: true, force: true });
    this.update({ status: "disconnected", qrDataUrl: undefined, phone: undefined, name: undefined, message: "Sesi dihapus." });
  }
}
