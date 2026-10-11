import { connectRecaptchaChrome, isPassoHttpUrl, pickRecaptchaTab } from "./recaptchaClient.js";

const DEFAULT_HOLD_ORIGINS = [
  "http://localhost:5173/*",
  "http://localhost:5174/*"
];
const OFFER_TTL_MS = 15 * 60 * 1000;
const DEFAULT_RECAPTCHA_API = "http://127.0.0.1:4000";

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
  if (area === "sync" && (changes.recaptchaApi || changes.recaptchaSecret)) reconnectRecaptcha();
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

// Runs in the page, so it sees the site's own grecaptcha and this profile's Google cookies.
async function mintOnPage(key, action) {
  const run = async () => {
    if (!globalThis.grecaptcha || !globalThis.grecaptcha.execute) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://www.google.com/recaptcha/api.js?render=" + key;
        script.onload = resolve;
        script.onerror = () => reject(new Error("recaptcha script blocked"));
        (document.head || document.documentElement).appendChild(script);
      });
    }
    if (globalThis.grecaptcha.ready) {
      await new Promise((resolve) => globalThis.grecaptcha.ready(resolve));
    }
    return await globalThis.grecaptcha.execute(key, { action });
  };
  const limit = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("reCAPTCHA execute timed out")), 8000);
  });
  return await Promise.race([run(), limit]);
}

const links = new Set();
let link = null;
let connecting = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let blocked = false;

function scheduleReconnect() {
  if (blocked || !links.size || reconnectTimer) return;
  const wait = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, 5000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (links.size) ensureSocket();
  }, wait);
}

function dropSocket() {
  const current = link;
  link = null;
  current?.close();
}

function reconnectRecaptcha() {
  blocked = false;
  reconnectDelay = 1000;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  dropSocket();
  if (links.size) ensureSocket();
}

async function chromeSettings() {
  const stored = await chrome.storage.sync.get({
    recaptchaApi: DEFAULT_RECAPTCHA_API,
    recaptchaSecret: ""
  });
  return {
    api: String(stored.recaptchaApi || DEFAULT_RECAPTCHA_API).trim() || DEFAULT_RECAPTCHA_API,
    secret: String(stored.recaptchaSecret || "")
  };
}

function ensureSocket() {
  if (blocked || link || connecting) return;
  connecting = chromeSettings().then((settings) => {
    const current = connectRecaptchaChrome(settings.api, {
      client: "recaptcha-chrome",
      secret: settings.secret
    }, {
      onConnect() {
        reconnectDelay = 1000;
      },
      onPull: (payload) => pullToken(payload),
      onDisconnect() {
        if (link === current) link = null;
        scheduleReconnect();
      },
      onReject() {
        blocked = true;
        if (link === current) link = null;
      }
    });
    link = current;
  }).catch(() => {
    scheduleReconnect();
  }).finally(() => {
    connecting = null;
  });
}

async function pullToken(payload) {
  const tab = pickRecaptchaTab(
    [...links].map((item) => ({ id: item.tabId, url: item.url })),
    payload?.pageUrl
  );
  if (!tab?.id) return { message: "Open passo.com.tr in this Chrome window." };
  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: mintOnPage,
      args: [String(payload?.siteKey || ""), String(payload?.action || "submit")]
    });
    const token = String(injected?.result || "");
    if (!token) return { message: "reCAPTCHA execute returned an empty token" };
    return { token };
  } catch (err) {
    return { message: err?.message || "reCAPTCHA failed in Chrome" };
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "recaptcha") return;
  const tab = port.sender?.tab;
  const url = tab?.url || port.sender?.url || "";
  if (!tab?.id || (url && !isPassoHttpUrl(url))) return;
  const item = { tabId: tab.id, url };
  links.add(item);
  port.onDisconnect.addListener(() => {
    links.delete(item);
    if (!links.size) dropSocket();
  });
  ensureSocket();
});
