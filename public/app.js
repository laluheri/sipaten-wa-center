const socket = io();
const statusEl = document.querySelector("#status");
const qrWrap = document.querySelector("#qr-wrap");
const qr = document.querySelector("#qr");
const loader = document.querySelector(".loader");
const connected = document.querySelector("#connected");
const identity = document.querySelector("#identity");
const connectButton = document.querySelector("#connect");
const disconnectButton = document.querySelector("#disconnect");
const message = document.querySelector("#message");
const sendForm = document.querySelector("#send-form");
const sendButton = document.querySelector("#send-button");
const sendResult = document.querySelector("#send-result");
const sendLocked = document.querySelector("#send-locked");
const summaryStatus = document.querySelector("#summary-status");
const deviceName = document.querySelector("#device-name");
const deviceNumber = document.querySelector("#device-number");
const deviceDot = document.querySelector("#device-dot");
const deviceStatusBadge = document.querySelector("#device-status-badge");
const deviceStatusNote = document.querySelector("#device-status-note");
const deviceId = document.querySelector("#device-id");

function render(state) {
  statusEl.className = `status ${state.status}`;
  statusEl.querySelector("span").textContent = {
    idle: "Belum terhubung", connecting: "Menghubungkan…", qr: "Menunggu pemindaian",
    connected: "Online", disconnected: "Terputus",
  }[state.status];
  message.textContent = state.message || "";
  const isConnected = state.status === "connected";
  const hasQr = state.status === "qr" && state.qrDataUrl;
  qrWrap.hidden = isConnected || state.status === "disconnected" || state.status === "idle";
  connected.hidden = !isConnected;
  sendForm.hidden = !isConnected;
  sendLocked.hidden = isConnected;
  summaryStatus.textContent = isConnected ? "Online" : "Belum terhubung";
  deviceName.textContent = state.name || "Perangkat WhatsApp";
  deviceId.textContent = state.id;
  deviceNumber.textContent = state.phone ? `+${state.phone}` : "—";
  deviceDot.className = `device-dot ${isConnected ? "online" : "offline"}`;
  deviceStatusBadge.className = `state-badge ${isConnected ? "online" : state.status === "qr" ? "waiting" : "offline"}`;
  deviceStatusBadge.textContent = isConnected ? "CONNECTED" : state.status === "qr" ? "WAITING QR" : state.status.toUpperCase();
  deviceStatusNote.textContent = state.message || "";
  connectButton.hidden = !["idle", "disconnected"].includes(state.status);
  disconnectButton.hidden = !isConnected;
  loader.hidden = Boolean(hasQr);
  qr.hidden = !hasQr;
  if (hasQr) qr.src = state.qrDataUrl;
  identity.textContent = [state.name, state.phone && `+${state.phone}`].filter(Boolean).join(" · ");
}

socket.on("session:state", render);
connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  await fetch("/api/session/connect", { method: "POST" });
  connectButton.disabled = false;
});
disconnectButton.addEventListener("click", async () => {
  if (!confirm("Putuskan perangkat dan hapus kredensial sesi lokal?")) return;
  await fetch("/api/session", { method: "DELETE" });
});
document.querySelector("#device-scan").addEventListener("click", () => {
  document.querySelector("#device").scrollIntoView({ behavior: "smooth" });
  if (!qrWrap.hidden) qrWrap.animate([{ transform: "scale(.97)" }, { transform: "scale(1)" }], { duration: 350 });
});
document.querySelector("#device-reload").addEventListener("click", async () => {
  await fetch("/api/session/connect", { method: "POST" });
  location.hash = "device";
});
document.querySelector("#device-delete").addEventListener("click", () => disconnectButton.click());
document.querySelector("#copy-device-id").addEventListener("click", async () => {
  await navigator.clipboard.writeText(deviceId.textContent);
  document.querySelector("#copy-feedback").textContent = "Device ID disalin";
  setTimeout(() => document.querySelector("#copy-feedback").textContent = "", 1800);
});
document.querySelector("#add-device").addEventListener("click", () => {
  document.querySelector("#device").scrollIntoView({ behavior: "smooth" });
  if (!connectButton.hidden) connectButton.click();
});
document.querySelector("#device-search").addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  const haystack = [deviceName.textContent, deviceNumber.textContent, deviceId.textContent, "local-01"].join(" ").toLowerCase();
  const visible = !query || haystack.includes(query);
  document.querySelector("#device-row").hidden = !visible;
  document.querySelector("#device-detail-row").hidden = !visible;
  document.querySelector("#device-empty").hidden = visible;
});
sendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  sendButton.disabled = true;
  sendButton.textContent = "Mengirim…";
  sendResult.className = "send-result";
  sendResult.textContent = "";

  try {
    const data = Object.fromEntries(new FormData(sendForm));
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Pesan gagal dikirim.");
    sendResult.className = "send-result success";
    sendResult.textContent = `✓ ${result.message}`;
    document.querySelector("#text").value = "";
  } catch (error) {
    sendResult.className = "send-result error";
    sendResult.textContent = error.message || "Pesan gagal dikirim.";
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Kirim pesan";
  }
});
fetch("/api/session").then((response) => response.json()).then(render);
fetch("/api/auth/me").then(async (response) => {
  if (!response.ok) return location.href = "/";
  document.querySelector("#admin-email").textContent = (await response.json()).email;
});
document.querySelector("#logout").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  location.href = "/";
});
