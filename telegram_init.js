export function getTelegramWebApp() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp : null;
}

function readInset(obj) {
  return {
    top: Math.max(0, Number(obj?.top) || 0),
    bottom: Math.max(0, Number(obj?.bottom) || 0),
    left: Math.max(0, Number(obj?.left) || 0),
    right: Math.max(0, Number(obj?.right) || 0),
  };
}

/** Push Telegram viewport + safe-area values into CSS variables (fullscreen-aware). */
export function applyTelegramViewportCss(tg = getTelegramWebApp()) {
  if (!tg || typeof document === "undefined") return;

  const root = document.documentElement;
  const safe = readInset(tg.safeAreaInset);
  const content = readInset(tg.contentSafeAreaInset);

  const setPx = (name, val) => root.style.setProperty(name, `${val}px`);

  setPx("--tg-safe-area-inset-top", safe.top);
  setPx("--tg-safe-area-inset-bottom", safe.bottom);
  setPx("--tg-safe-area-inset-left", safe.left);
  setPx("--tg-safe-area-inset-right", safe.right);
  setPx("--tg-content-safe-area-inset-top", content.top);
  setPx("--tg-content-safe-area-inset-bottom", content.bottom);
  setPx("--tg-content-safe-area-inset-left", content.left);
  setPx("--tg-content-safe-area-inset-right", content.right);

  const vh = Number(tg.viewportHeight) || window.innerHeight;
  const vsh = Number(tg.viewportStableHeight) || vh;
  setPx("--tg-viewport-height", vh);
  setPx("--tg-viewport-stable-height", vsh);

  root.classList.toggle("tg-fullscreen", Boolean(tg.isFullscreen));
  root.classList.toggle(
    "tg-keyboard-open",
    vh > 0 && vsh > 0 && vh < vsh * 0.82,
  );
}

/** Maximize Mini App height + fullscreen where the client supports it (Bot API 7.10+). */
function maximizeTelegramViewport(tg) {
  if (!tg) return;
  try {
    tg.ready();
  } catch {
    /* ignore */
  }
  try {
    tg.expand?.();
  } catch {
    /* ignore */
  }
  try {
    if (typeof tg.requestFullscreen === "function") {
      tg.requestFullscreen();
    }
  } catch {
    /* older clients / policy */
  }
  try {
    tg.disableVerticalSwipes?.();
  } catch {
    /* ignore */
  }
  applyTelegramViewportCss(tg);
}

const VIEWPORT_EVENTS = [
  "viewportChanged",
  "safeAreaChanged",
  "contentSafeAreaChanged",
  "fullscreenChanged",
  "activated",
  "deactivated",
];

/**
 * Keep CSS viewport/safe-area vars in sync with Telegram chrome (header, home bar, keyboard).
 * Call once on app mount; safe to call multiple times.
 */
export function installTelegramViewportSync() {
  const tg = getTelegramWebApp();
  if (!tg) return () => {};
  if (tg.__autotradeViewportSyncInstalled) {
    applyTelegramViewportCss(tg);
    return () => {};
  }
  tg.__autotradeViewportSyncInstalled = true;

  maximizeTelegramViewport(tg);

  const apply = () => applyTelegramViewportCss(tg);
  VIEWPORT_EVENTS.forEach((ev) => {
    try {
      tg.onEvent?.(ev, apply);
    } catch {
      /* ignore */
    }
  });

  window.addEventListener("resize", apply);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", apply);
    window.visualViewport.addEventListener("scroll", apply);
  }

  return () => {
    window.removeEventListener("resize", apply);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", apply);
      window.visualViewport.removeEventListener("scroll", apply);
    }
  };
}

export function getInitData() {
  const tg = getTelegramWebApp();
  if (!tg) return "";
  maximizeTelegramViewport(tg);
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
  return installTelegramViewportSync();
}

export function applyTheme() {
  const tg = getTelegramWebApp();
  if (!tg) return;
  maximizeTelegramViewport(tg);
  if (!tg?.themeParams?.bg_color) return;
  document.documentElement.style.setProperty("--tg-bg", tg.themeParams.bg_color);
}

export function isTelegramKeyboardOpen(tg = getTelegramWebApp()) {
  if (!tg) return false;
  const vh = Number(tg.viewportHeight) || 0;
  const vsh = Number(tg.viewportStableHeight) || 0;
  return vh > 0 && vsh > 0 && vh < vsh * 0.82;
}
