const EMAIL_SEL = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[formcontrolname="email"]',
  'input[autocomplete="username"]',
  'input[autocomplete="email"]'
].join(",");

const PASS_SEL = [
  'input[type="password"]',
  'input[name="password"]',
  'input[formcontrolname="password"]',
  'input[autocomplete="current-password"]'
].join(",");

const CHALLENGE_SEL = [
  'iframe[src*="challenges.cloudflare.com"]',
  'iframe[src*="turnstile"]',
  'iframe[src*="recaptcha"]',
  'iframe[title*="Cloudflare"]',
  ".cf-turnstile",
  "[data-cf-turnstile]",
  "#cf-challenge-running",
  "#challenge-form",
  "#challenge-running",
  ".g-recaptcha",
  "[name='cf-turnstile-response']"
].join(",");

let used = false;

function visible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 8 && rect.height > 8 && style.visibility !== "hidden" && style.display !== "none";
}

function firstVisible(selector) {
  return [...document.querySelectorAll(selector)].find(visible) || null;
}

function findFields() {
  const email = firstVisible(EMAIL_SEL);
  const password = firstVisible(PASS_SEL);
  return email && password ? { email, password } : null;
}

function hasChallenge() {
  return [...document.querySelectorAll(CHALLENGE_SEL)].some(visible);
}

function setNative(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function submitLogin(password) {
  const form = password.closest("form");
  if (form?.requestSubmit) {
    form.requestSubmit();
    return;
  }
  const button = firstVisible('button[type="submit"], input[type="submit"]')
    || [...document.querySelectorAll("button")].find((el) => (
      visible(el) && /giriş|giris|login|oturum/i.test(el.textContent || "")
    ));
  if (button) {
    button.click();
    return;
  }
  password.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
}

function apply(offer) {
  if (used || !offer?.email || !offer.password) return false;
  const fields = findFields();
  if (!fields) return false;
  used = true;
  setNative(fields.email, offer.email);
  setNative(fields.password, offer.password);
  if (!hasChallenge()) submitLogin(fields.password);
  return true;
}

function takeOffer() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "take" }, (offer) => resolve(offer || null));
  });
}

function watchForForm(offer) {
  if (apply(offer)) return;
  const obs = new MutationObserver(() => {
    if (apply(offer)) obs.disconnect();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 12000);
}

async function tryFill() {
  const offer = await takeOffer();
  if (!offer) return;
  watchForForm(offer);
}

chrome.storage.session.onChanged.addListener((changes) => {
  const next = changes.offer?.newValue;
  if (!next?.email) return;
  used = false;
  watchForForm({
    email: next.email,
    password: next.password || ""
  });
});

chrome.storage.sync.onChanged.addListener((changes) => {
  if (changes.enabled && changes.enabled.newValue === false) used = false;
});

void tryFill();
