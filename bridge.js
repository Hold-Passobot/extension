const OFFER_TYPE = "hold.passo.login.offer";
const OFFER_SOURCE = "hold-platform";

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.source !== OFFER_SOURCE || data.type !== OFFER_TYPE) return;
  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  if (!email) return;
  chrome.runtime.sendMessage({ type: "offer", email, password });
});
