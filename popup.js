const toggle = document.getElementById("toggle");
const state = document.getElementById("state");

function paint(enabled) {
  toggle.classList.toggle("on", enabled);
  toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
  state.textContent = enabled ? "Açık" : "Kapalı";
}

chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
  paint(enabled !== false);
});

toggle.addEventListener("click", async () => {
  const cur = await chrome.storage.sync.get({ enabled: true });
  const enabled = cur.enabled === false;
  await chrome.storage.sync.set({ enabled });
  paint(enabled);
});
