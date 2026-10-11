// Keeps the service worker awake while this Passo tab is open, so the API can ask
// this signed-in Chrome for a reCAPTCHA token. Reconnect only after the port drops.
function hold() {
  if (!chrome.runtime?.id) return;
  let port;
  try {
    port = chrome.runtime.connect({ name: "recaptcha" });
  } catch {
    return;
  }
  port.onDisconnect.addListener(() => {
    setTimeout(hold, 1000);
  });
}

hold();
