import { useCallback, useEffect, useState } from "react";

const BERLIN_TZ = "Europe/Berlin";

function getBerlinClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    weekday: map.weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

/** No live stat updates: Fri 22:00 → Mon 00:50 (Europe/Berlin). */
export function isStatsFrozenBerlin(now = new Date()) {
  const { weekday, hour, minute } = getBerlinClock(now);
  const mins = hour * 60 + minute;

  if (weekday === "Sat" || weekday === "Sun") return true;
  if (weekday === "Fri" && mins >= 22 * 60) return true;
  if (weekday === "Mon" && mins < 50) return true;
  return false;
}

function rndF(min, max) {
  return min + Math.random() * (max - min);
}

function maskUser() {
  const letters = "abcdefghijkmnopqrstuvwxyz";
  const alnum = "abcdefghijkmnopqrstuvwxyz0123456789";
  const visLen = 3 + Math.floor(Math.random() * 3);
  let u = letters[Math.floor(Math.random() * letters.length)];
  for (let i = 1; i < visLen; i += 1) {
    u += alnum[Math.floor(Math.random() * alnum.length)];
  }
  return `@${u}${"*".repeat(3 + Math.floor(Math.random() * 2))}`;
}

function clampProfit(v) {
  return Math.max(1001, Math.min(9999.99, v));
}

export function fmtLeaderboardUsd(v) {
  return `$${v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function seedLeaderboard() {
  let v = rndF(4200, 9800);
  const vals = [v];
  for (let i = 0; i < 4; i += 1) {
    v -= rndF(180, 1050);
    vals.push(clampProfit(v));
  }
  vals.sort((a, b) => b - a);
  return vals.map((profit) => ({ user: maskUser(), profit: clampProfit(profit) }));
}

export function useLeaderboard(enabled = true) {
  const [rows, setRows] = useState([]);
  const [flash, setFlash] = useState(false);
  const [frozen, setFrozen] = useState(() => isStatsFrozenBerlin());

  const tick = useCallback(() => {
    if (isStatsFrozenBerlin()) return;
    setRows((prev) => {
      let next = prev.map((t) => ({
        ...t,
        profit: clampProfit(t.profit + rndF(-70, 160)),
      }));
      if (Math.random() < 0.3) {
        next = [...next];
        next[next.length - 1] = {
          user: maskUser(),
          profit: clampProfit(rndF(1050, 3200)),
        };
      }
      next.sort((a, b) => b.profit - a.profit);
      return next;
    });
    setFlash(true);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    setRows(seedLeaderboard());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const syncFrozen = () => setFrozen(isStatsFrozenBerlin());
    syncFrozen();
    const id = window.setInterval(syncFrozen, 30_000);
    return () => window.clearInterval(id);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !rows.length) return undefined;
    const id = window.setInterval(tick, 6000);
    return () => window.clearInterval(id);
  }, [enabled, rows.length, tick]);

  useEffect(() => {
    if (!flash) return undefined;
    const t = window.setTimeout(() => setFlash(false), 450);
    return () => window.clearTimeout(t);
  }, [flash]);

  return { rows, flash, frozen };
}
