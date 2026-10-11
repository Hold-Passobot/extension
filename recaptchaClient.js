// Tiny socket.io v4 client (websocket only). The extension cannot load a remote script,
// and the service worker stays up only while a Passo tab holds a port to it.

export function isPassoHttpUrl(url) {
  try {
    const host = new URL(String(url || "")).hostname;
    return host === "passo.com.tr" || host.endsWith(".passo.com.tr");
  } catch {
    return false;
  }
}

export function pickRecaptchaTab(tabs, pageUrl) {
  const list = (Array.isArray(tabs) ? tabs : []).filter((tab) => tab && tab.id);
  const wanted = String(pageUrl || "").replace(/\/$/, "");
  if (wanted) {
    const match = list.find((tab) => {
      const url = String(tab.url || "");
      const bare = url.replace(/\/$/, "");
      return bare === wanted || url.startsWith(`${wanted}?`) || url.startsWith(`${wanted}#`);
    });
    if (match) return match;
  }
  return list[0] || null;
}

function parseEvent(packet) {
  let i = 1;
  if (packet[i] === "/") {
    const comma = packet.indexOf(",", i);
    if (comma < 0) return null;
    i = comma + 1;
  }
  let id = "";
  while (packet[i] >= "0" && packet[i] <= "9") id += packet[i++];
  if (packet[i] !== "[") return null;
  const data = JSON.parse(packet.slice(i));
  if (!Array.isArray(data)) return null;
  return { id: id === "" ? null : Number(id), data };
}

async function asText(data) {
  if (typeof data === "string") return data;
  if (data && typeof data.text === "function") return data.text();
  return String(data ?? "");
}

export function connectRecaptchaChrome(apiOrigin, auth, hooks = {}) {
  const httpBase = String(apiOrigin || "http://127.0.0.1:4000").replace(/\/$/, "");
  const wsBase = httpBase.replace(/^http/i, "ws");
  const ws = new WebSocket(`${wsBase}/socket.io/?EIO=4&transport=websocket`);
  let outcome = "";

  function finish(kind) {
    if (outcome) return;
    outcome = kind;
    try { ws.close(); } catch { /* already closed */ }
    if (kind === "reject") hooks.onReject?.();
    else hooks.onDisconnect?.();
  }

  ws.addEventListener("error", () => finish("drop"));
  ws.addEventListener("close", () => finish("drop"));
  ws.addEventListener("message", (event) => {
    void (async () => {
      if (outcome) return;
      const data = await asText(event.data);
      if (data.startsWith("0")) {
        ws.send(`40${JSON.stringify(auth || {})}`);
        return;
      }
      // Engine.io ping is "2". A socket.io event is prefixed with "4".
      if (data === "2" || data.startsWith("2")) {
        ws.send("3");
        return;
      }
      if (!data.startsWith("4")) return;
      const packet = data.slice(1);
      if (packet[0] === "0") {
        hooks.onConnect?.();
        return;
      }
      if (packet[0] === "4") {
        finish("reject");
        return;
      }
      if (packet[0] !== "2") return;
      const parsed = parseEvent(packet);
      if (!parsed || parsed.data[0] !== "recaptcha.pull") return;
      let body = { message: "reCAPTCHA execute returned an empty token" };
      try {
        body = (await hooks.onPull?.(parsed.data[1] || {})) || body;
      } catch (err) {
        body = { message: err?.message || "reCAPTCHA failed in Chrome" };
      }
      if (outcome || parsed.id == null) return;
      ws.send(`43${parsed.id}${JSON.stringify([body])}`);
    })().catch(() => finish("drop"));
  });

  return {
    close() {
      finish("drop");
    }
  };
}
