export function getTelegramWebApp() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp : null;
}

export function getInitData() {
  const tg = getTelegramWebApp();
  if (!tg) return "";
  tg.ready();
  tg.expand?.();
  return tg.initData || "";
}

export function getTelegramUser() {
  const tg = getTelegramWebApp();
  if (!tg) return null;
  const direct = tg.initDataUnsafe?.user;
  if (direct && typeof direct === "object") return direct;

  const raw = tg.initData || "";
  if (!raw) return null;
  try {
    const params = new URLSearchParams(raw);
    const userRaw = params.get("user");
    if (!userRaw) return null;
    const parsed = JSON.parse(userRaw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function prepareTelegramWebAppViewport() {
  const tg = getTelegramWebApp();
  if (!tg) return;
  tg.ready();
  tg.expand?.();
  // Helps keep app in expanded state on mobile gestures.
  tg.disableVerticalSwipes?.();
}

export function applyTheme() {
  const tg = getTelegramWebApp();
  if (!tg) return;
  tg.ready();
  tg.expand?.();
  tg.disableVerticalSwipes?.();
  if (!tg?.themeParams?.bg_color) return;
  document.documentElement.style.setProperty("--tg-bg", tg.themeParams.bg_color);
}
