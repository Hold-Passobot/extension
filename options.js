const DEFAULT_HOLD_ORIGINS = [
  "http://localhost:5173/*",
  "http://localhost:5174/*"
];

const originsEl = document.getElementById("origins");
const apiEl = document.getElementById("api");
const secretEl = document.getElementById("secret");
const statusEl = document.getElementById("status");

chrome.storage.sync.get({
  holdOrigins: DEFAULT_HOLD_ORIGINS,
  recaptchaApi: "http://127.0.0.1:4000",
  recaptchaSecret: ""
}, (stored) => {
  const rows = Array.isArray(stored.holdOrigins) ? stored.holdOrigins : DEFAULT_HOLD_ORIGINS;
  originsEl.value = [...new Set([...DEFAULT_HOLD_ORIGINS, ...rows])].join("\n");
  apiEl.value = stored.recaptchaApi || "http://127.0.0.1:4000";
  secretEl.value = stored.recaptchaSecret || "";
});

document.getElementById("save").addEventListener("click", async () => {
  const holdOrigins = originsEl.value.split(/\s+/).map((row) => row.trim()).filter(Boolean);
  const recaptchaApi = apiEl.value.trim() || "http://127.0.0.1:4000";
  const recaptchaSecret = secretEl.value.trim();
  await chrome.storage.sync.set({ holdOrigins, recaptchaApi, recaptchaSecret });
  try {
    const origin = new URL(recaptchaApi).origin + "/*";
    if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/\*$/.test(origin)) {
      await chrome.permissions.request({ origins: [origin] });
    }
  } catch { /* the API field was not a URL */ }
  chrome.runtime.sendMessage({ type: "refresh-origins" }, () => {
    statusEl.textContent = "Kaydedildi. Passo sekmesi açık kalsın. Cloud Run adresini eklediysen uzantı iznini onayla.";
  });
});
