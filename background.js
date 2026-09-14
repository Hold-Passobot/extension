const DEFAULT_HOLD_ORIGINS = [
  "http://localhost:5173/*",
  "http://localhost:5174/*"
];
const OFFER_TTL_MS = 15 * 60 * 1000;

async function isEnabled() {
  const { enabled = true } = await chrome.storage.sync.get({ enabled: true });
  return enabled !== false;
}

async function paintBadge() {
  const on = await isEnabled();
  await chrome.action.setBadgeBackgroundColor({ color: on ? "#2f6f4e" : "#8a3a2a" });
  await chrome.action.setBadgeText({ text: on ? "" : "OFF" });
}

async function holdOrigins() {
  const stored = await chrome.storage.sync.get({ holdOrigins: DEFAULT_HOLD_ORIGINS });
  const rows = Array.isArray(stored.holdOrigins) ? stored.holdOrigins : DEFAULT_HOLD_ORIGINS;
  return [...new Set([...DEFAULT_HOLD_ORIGINS, ...rows].map((row) => String(row || "").trim()).filter(Boolean))];
}

async function refreshHoldBridge() {
  const matches = await holdOrigins();
  await chrome.scripting.unregisterContentScripts({ ids: ["hold-bridge"] }).catch(() => {});
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([{
    id: "hold-bridge",
    js: ["bridge.js"],
    matches,
    runAt: "document_start",
    persistAcrossSessions: true
  }]).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  void refreshHoldBridge();
  void paintBadge();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshHoldBridge();
  void paintBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.holdOrigins) void refreshHoldBridge();
  if (area === "sync" && changes.enabled) void paintBadge();
});

void paintBadge();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "refresh-origins") {
    void refreshHoldBridge().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "offer") {
    const email = String(message.email || "").trim().toLowerCase();
    const password = String(message.password || "");
    if (!email) {
      sendResponse({ ok: false });
      return false;
    }
    void isEnabled().then(async (on) => {
      if (!on) {
        sendResponse({ ok: false, disabled: true });
        return;
      }
      const cur = await chrome.storage.session.get({ remembered: {} });
      const remembered = { ...(cur.remembered || {}) };
      if (password) remembered[email] = password;
      await chrome.storage.session.set({
        offer: { email, password: password || remembered[email] || "", at: Date.now() },
        remembered
      });
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message?.type === "take") {
    void isEnabled().then(async (on) => {
      if (!on) {
        sendResponse(null);
        return;
      }
      const cur = await chrome.storage.session.get({ offer: null, remembered: {} });
      const offer = cur.offer;
      if (!offer?.email || Date.now() - Number(offer.at || 0) > OFFER_TTL_MS) {
        sendResponse(null);
        return;
      }
      sendResponse({
        email: offer.email,
        password: offer.password || cur.remembered?.[offer.email] || ""
      });
    });
    return true;
  }
  return false;
});
