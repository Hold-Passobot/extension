const DEFAULT_HOLD_ORIGINS = [
  "http://localhost:5173/*",
  "http://localhost:5174/*"
];

const originsEl = document.getElementById("origins");
const statusEl = document.getElementById("status");

chrome.storage.sync.get({ holdOrigins: DEFAULT_HOLD_ORIGINS }, (stored) => {
  const rows = Array.isArray(stored.holdOrigins) ? stored.holdOrigins : DEFAULT_HOLD_ORIGINS;
  originsEl.value = [...new Set([...DEFAULT_HOLD_ORIGINS, ...rows])].join("\n");
});

document.getElementById("save").addEventListener("click", async () => {
  const holdOrigins = originsEl.value.split(/\s+/).map((row) => row.trim()).filter(Boolean);
  await chrome.storage.sync.set({ holdOrigins });
  chrome.runtime.sendMessage({ type: "refresh-origins" }, () => {
    statusEl.textContent = "Kaydedildi. Cloud Run adresini eklediysen uzantı izinlerini Chrome’dan onayla.";
  });
});
