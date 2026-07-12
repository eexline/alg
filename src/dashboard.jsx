import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import SubscriptionUpgradeFlow, {
  ProfileSubscriptionCard,
} from "./subscription_upgrade.jsx";
import { fmtLeaderboardUsd, useLeaderboard } from "./leaderboard.js";
import "./dashboard_ref.css";

const emptyForm = {
  broker_name: "",
  login: "",
  password: "",
  server: "",
  risk_percent: 1,
};

/** Fixed product: gold (XAUUSD); strategy label follows subscription tier. */
const TRADING_INSTRUMENT_LABEL = "XAUUSD (Gold)";

function strategyLabelForTier(tierKey) {
  const t = String(tierKey || "").trim().toLowerCase();
  if (t === "pro") return "PHASE PRO";
  if (t === "elite") return "PHASE ELITE";
  return "PHASE START";
}

/** Keep “Connecting” UI visible at least this long (API may return faster). */
const MIN_CONNECT_UI_MS = 3000;

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const BERLIN_TZ = "Europe/Berlin";

function _dtfParts(timeZone, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const out = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

function _tzOffsetMs(date, timeZone) {
  // Offset = (formatted-in-tz as-if-UTC) - (actual UTC time)
  const p = _dtfParts(timeZone, date);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return asUtc - date.getTime();
}

function _zonedTimeToUtcMs({ year, month, day, hour, minute }, timeZone) {
  // Two-pass conversion to account for DST.
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMs = guessUtc - _tzOffsetMs(new Date(guessUtc), timeZone);
  utcMs = guessUtc - _tzOffsetMs(new Date(utcMs), timeZone);
  return utcMs;
}

function getWeekendMarketStatusBerlin(now = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TZ,
    weekday: "short",
  }).format(now);
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  if (!isWeekend) return { closed: false, nextOpenUtcMs: 0 };

  const p = _dtfParts(BERLIN_TZ, now);
  const y = Number(p.year);
  const m = Number(p.month);
  const d = Number(p.day);

  // Find next Monday in Berlin calendar.
  const addDays = weekday === "Sat" ? 2 : 1;
  const baseUtcNoon = _zonedTimeToUtcMs({ year: y, month: m, day: d, hour: 12, minute: 0 }, BERLIN_TZ);
  const mondayUtcNoon = baseUtcNoon + addDays * 24 * 60 * 60 * 1000;
  const mondayParts = _dtfParts(BERLIN_TZ, new Date(mondayUtcNoon));
  const nextOpenUtcMs = _zonedTimeToUtcMs(
    {
      year: Number(mondayParts.year),
      month: Number(mondayParts.month),
      day: Number(mondayParts.day),
      hour: 9,
      minute: 0,
    },
    BERLIN_TZ
  );
  return { closed: true, nextOpenUtcMs };
}

function ConnectEyeIcon({ open, className = "" }) {
  if (open) {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function HomeTabIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}

function ProfileTabIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function RowChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function fmtRefNum(n, digits = 0) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function Dashboard({ user, refreshKey, onRefresh }) {
  const [sessions, setSessions] = useState([]);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [tierLabel, setTierLabel] = useState(
    () => user?.subscription_tier_label || null,
  );
  const [strategyLabel, setStrategyLabel] = useState(() =>
    strategyLabelForTier(user?.subscription_tier),
  );

  useEffect(() => {
    setTierLabel(user?.subscription_tier_label || null);
    setStrategyLabel(strategyLabelForTier(user?.subscription_tier));
  }, [user?.subscription_tier, user?.subscription_tier_label]);

  // server selection modal removed (connect broker only)
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [brokerExpanded, setBrokerExpanded] = useState(true);
  const [connectSubmitting, setConnectSubmitting] = useState(false);
  const [startSubmitting, setStartSubmitting] = useState(false);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [connectErr, setConnectErr] = useState("");
  const [connectErrBump, setConnectErrBump] = useState(0);
  const [fieldErrors, setFieldErrors] = useState({ server: false, login: false, password: false });
  const [showConnectPassword, setShowConnectPassword] = useState(false);
  const brokerListHydrated = useRef(false);
  const notifiedFailedSessionRef = useRef("");
  /** After Start, ignore Stop briefly — mobile/WebView can fire a delayed click on the same spot once the label flips to Stop. */
  const postStartStopGuardRef = useRef(false);
  const postStartStopGuardTimerRef = useRef(0);
  const [postStartStopGuard, setPostStartStopGuard] = useState(false);
  const dashShellRef = useRef(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [formControlFocused, setFormControlFocused] = useState(false);
  const hideTabBar = keyboardOpen || formControlFocused;

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const marketStatus = useMemo(() => {
    // depends on nowTick to refresh
    void nowTick;
    const s = getWeekendMarketStatusBerlin(new Date());
    const nextOpenText = s.closed && s.nextOpenUtcMs
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: BERLIN_TZ,
          weekday: "long",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(s.nextOpenUtcMs))
      : "";
    return { ...s, nextOpenText };
  }, [nowTick]);

  useEffect(() => {
    setMsg((m) => (m.trim().toLowerCase() === "linked" ? "" : m));
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    const thresholdPx = 80;

    const syncKeyboard = () => {
      if (!vv) {
        setKeyboardOpen(false);
        return;
      }
      const layoutH = window.document.documentElement.clientHeight || window.innerHeight;
      const gap = layoutH - vv.height - (vv.offsetTop || 0);
      setKeyboardOpen(gap > thresholdPx);
    };

    const syncFormControlFocus = () => {
      const shell = dashShellRef.current;
      const ae = document.activeElement;
      const inside =
        !!(
          ae &&
          shell &&
          shell.contains(ae) &&
          (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")
        );
      setFormControlFocused(inside);
    };

    const onFocusIn = (e) => {
      const t = e.target;
      if (
        !t ||
        !dashShellRef.current ||
        !dashShellRef.current.contains(t) ||
        (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA" && t.tagName !== "SELECT")
      ) {
        return;
      }
      setFormControlFocused(true);
      requestAnimationFrame(() => {
        syncKeyboard();
        syncFormControlFocus();
        window.setTimeout(syncKeyboard, 180);
        window.setTimeout(syncKeyboard, 400);
      });
    };

    const onFocusOut = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          syncFormControlFocus();
        });
      });
      window.setTimeout(syncKeyboard, 120);
      window.setTimeout(syncKeyboard, 400);
    };

    if (vv) {
      vv.addEventListener("resize", syncKeyboard);
      vv.addEventListener("scroll", syncKeyboard);
    }
    window.addEventListener("resize", syncKeyboard);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    syncKeyboard();

    return () => {
      if (vv) {
        vv.removeEventListener("resize", syncKeyboard);
        vv.removeEventListener("scroll", syncKeyboard);
      }
      window.removeEventListener("resize", syncKeyboard);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (postStartStopGuardTimerRef.current) {
        window.clearTimeout(postStartStopGuardTimerRef.current);
      }
    };
  }, []);

  const tradingAccountId = useMemo(() => {
    if (!accounts.length) return "";
    const cur = accountId != null && String(accountId) !== "" ? String(accountId) : "";
    if (cur && accounts.some((a) => String(a.id) === cur)) return cur;
    return String(accounts[0].id);
  }, [accounts, accountId]);

  const brokerChangeMode = accounts.length > 0 && brokerExpanded;

  async function load() {
    setErr("");
    try {
      const [me, s, b] = await Promise.all([api.me(), api.sessions(), api.listBrokers()]);
      if (!me?.has_access) {
        localStorage.removeItem("access_token");
        onRefresh?.();
        return;
      }
      setTierLabel(me?.subscription_tier_label || null);
      setStrategyLabel(strategyLabelForTier(me?.subscription_tier));
      setSessions(s);
      setAccounts(b);
      if (b.length) {
        setAccountId((prev) => {
          const p = prev != null && String(prev) !== "" ? String(prev) : "";
          const ok = p && b.some((a) => String(a.id) === p);
          return ok ? p : String(b[0].id);
        });
        if (!brokerListHydrated.current) {
          brokerListHydrated.current = true;
          setBrokerExpanded(false);
        }
      } else {
        setAccountId("");
        setBrokerExpanded(true);
      }
    } catch (e) {
      const msg = String(e?.message || e || "");
      const unauthorized =
        e?.status === 401 ||
        msg.includes("401") ||
        msg.toLowerCase().includes("not authenticated") ||
        msg.toLowerCase().includes("no authorization") ||
        msg.toLowerCase().includes("unauthorized");
      if (unauthorized) {
        localStorage.removeItem("access_token");
        setErr("");
        onRefresh?.();
        return;
      }
      setErr(String(e.message || e));
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  useEffect(() => {
    const id = window.setInterval(() => {
      load();
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshKey]);

  async function start() {
    if (startSubmitting) return;
    setErr("");
    if (marketStatus.closed) {
      setErr(
        marketStatus.nextOpenText
          ? `Market closed (weekend). Trading will be available: ${marketStatus.nextOpenText} (Berlin).`
          : "Market closed (weekend)."
      );
      return;
    }
    setStartSubmitting(true);
    try {
      await api.startTrading(Number(tradingAccountId));
      await load();
      if (postStartStopGuardTimerRef.current) {
        window.clearTimeout(postStartStopGuardTimerRef.current);
      }
      postStartStopGuardRef.current = true;
      setPostStartStopGuard(true);
      postStartStopGuardTimerRef.current = window.setTimeout(() => {
        postStartStopGuardRef.current = false;
        setPostStartStopGuard(false);
        postStartStopGuardTimerRef.current = 0;
      }, 1200);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setStartSubmitting(false);
    }
  }

  async function stop(id) {
    if (postStartStopGuardRef.current || stopSubmitting) return;
    setErr("");
    setStopSubmitting(true);
    try {
      await api.stopTrading(id);
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setStopSubmitting(false);
    }
  }

  async function submitBroker(e) {
    e.preventDefault();
    setErr("");
    setConnectErr("");
    setMsg("");
    const server = form.server.trim();
    const login = form.login.trim();
    const password = form.password.trim();
    const nextErrors = { server: !server, login: !login, password: !password };
    if (nextErrors.server || nextErrors.login || nextErrors.password) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({ server: false, login: false, password: false });
    setConnectSubmitting(true);
    const connectFlowStarted = performance.now();
    try {
      const brokerName = (form.broker_name || server || "Broker").trim().slice(0, 128);
      const queued = await api.addBrokerAsync({
        ...form,
        broker_name: brokerName,
        server,
        login,
        password,
        risk_percent: Number(form.risk_percent),
      });
      const jobId = String(queued?.job_id || "");
      if (!jobId) throw new Error("broker auth queue error");

      let created = null;
      const pollDeadline = Date.now() + 180000;
      while (Date.now() < pollDeadline) {
        const job = await api.brokerAuthJob(jobId);
        const st = String(job?.status || "");
        if (st === "success") {
          created = job?.account || null;
          break;
        }
        if (st === "error") {
          throw new Error(String(job?.error || "broker authorization failed"));
        }
        await sleepMs(1200);
      }
      if (!created) {
        throw new Error("broker authorization timeout, try again");
      }

      let elapsed = performance.now() - connectFlowStarted;
      if (elapsed < MIN_CONNECT_UI_MS) {
        await sleepMs(MIN_CONNECT_UI_MS - elapsed);
      }
      if (created?.id != null) {
        setAccountId(String(created.id));
      }
      setForm(emptyForm);
      setBrokerExpanded(false);
      brokerListHydrated.current = true;
      await load();
      onRefresh?.();
    } catch (e) {
      let elapsed = performance.now() - connectFlowStarted;
      if (elapsed < MIN_CONNECT_UI_MS) {
        await sleepMs(MIN_CONNECT_UI_MS - elapsed);
      }
      setConnectErr(String(e.message || e));
      setConnectErrBump((b) => b + 1);
    } finally {
      setConnectSubmitting(false);
    }
  }

  const openSessions = sessions.filter(
    (s) => s.state === "running" || s.state === "queued"
  );

  const accessExpiryMs = user.access_expires_at
    ? new Date(user.access_expires_at).getTime()
    : null;
  const accessMsLeft =
    accessExpiryMs != null ? Math.max(0, accessExpiryMs - Date.now()) : null;
  const hasActiveAccess =
    Boolean(user.has_access) &&
    (accessMsLeft == null ? true : accessMsLeft > 0);

  function cancelBrokerEdit() {
    if (!accounts.length) return;
    setBrokerExpanded(false);
    setFieldErrors({ server: false, login: false, password: false });
    setConnectErr("");
    setForm(emptyForm);
  }

  const selectedServerName =
    accounts.find((a) => String(a.id) === String(tradingAccountId))?.server || "Demo";
  const primaryAccount =
    accounts.find((a) => String(a.id) === String(tradingAccountId)) || accounts[0];
  const activeSessionForAccount = sessions.find(
    (s) =>
      String(s.account_id) === String(tradingAccountId) &&
      (s.state === "running" || s.state === "queued")
  );
  const latestSessionForAccount = sessions.find(
    (s) => String(s.account_id) === String(tradingAccountId)
  );
  // Profit in profile should be per current session (not sum of historical sessions).
  const sessionPnl = (() => {
    const src = activeSessionForAccount || latestSessionForAccount;
    if (!src) return null;
    if (src.pnl === null || src.pnl === undefined) return null;
    const n = Number(src.pnl);
    return Number.isFinite(n) ? n : null;
  })();
  useEffect(() => {
    const failedSession = sessions.find(
      (s) =>
        String(s.account_id) === String(tradingAccountId) &&
        s.state === "failed"
    );
    if (!failedSession) return;
    const key = String(failedSession.id);
    if (notifiedFailedSessionRef.current === key) return;
    notifiedFailedSessionRef.current = key;
    // Do not show generic "worker crashed" banner in WebApp.
  }, [sessions, tradingAccountId]);
  const latestSnapshotForAccount = sessions.find(
    (s) =>
      String(s.account_id) === String(tradingAccountId) &&
      (s.last_balance != null || s.last_equity != null || s.last_margin != null)
  );
  const accountSnapshot =
    activeSessionForAccount || latestSnapshotForAccount || latestSessionForAccount;
  const livePositions = useMemo(() => {
    // Positions are live-only: don't show stale snapshot from stopped sessions.
    const raw = activeSessionForAccount?.positions_json;
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [activeSessionForAccount?.positions_json]);

  const profileBalance =
    accountSnapshot?.last_balance != null
      ? Number(accountSnapshot.last_balance)
      : null;
  const profileEquity =
    accountSnapshot?.last_equity != null ? Number(accountSnapshot.last_equity) : null;
  const profileMargin =
    accountSnapshot?.last_margin != null ? Number(accountSnapshot.last_margin) : null;

  const { rows: leaderboardRows, flash: leaderboardFlash } = useLeaderboard(
    activeTab === "dashboard",
  );

  return (
    <div className="dashRoot">
      <div
        ref={dashShellRef}
        className={`dashShell${hideTabBar ? " dashKeyboardOpen" : ""}`}
      >
        <header className="dashHeaderFixed">
          <div className="refHdr">
            <img src="/logo.png" alt="" className="refHdrLogo" />
          </div>
        </header>

        <main className="dashContent">
          <div className="dashPanel">
            {err ? (
              <div className="dashPanelErr" role="alert">
                <span className="dashPanelErrGlyph" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                    />
                  </svg>
                </span>
                <div className="dashPanelErrBody">
                  <span className="dashPanelErrLabel">Something went wrong</span>
                  <p className="dashPanelErrText">{err}</p>
                </div>
              </div>
            ) : null}
            {msg && msg.trim().toLowerCase() !== "linked" ? (
              <div className="dashMsg">{msg}</div>
            ) : null}

            {activeTab === "profile" && (
              <div key="profile" className="dashTabPane">
                <div className="refProfilePad">
                  <ProfileSubscriptionCard
                    currentTier={user?.subscription_tier}
                    tierLabel={tierLabel || strategyLabel}
                    accessExpiresAt={user?.access_expires_at}
                    hasActiveAccess={hasActiveAccess}
                    onUpgrade={() => setUpgradeOpen(true)}
                  />

                  <div className="sec-lbl dashAnim">Balance</div>
                  <div className="refCard dashAnim">
                    <div className="refBalGrid">
                      <div className="refBalC">
                        <div className="refBalL">Balance</div>
                        <div className="refBalV">{fmtRefNum(profileBalance, 0)}</div>
                        <div className="refBalU">USDT</div>
                      </div>
                      <div className="refBalC">
                        <div className="refBalL">Equity</div>
                        <div className="refBalV">{fmtRefNum(profileEquity, 0)}</div>
                        <div className="refBalU">USDT</div>
                      </div>
                      <div className="refBalC">
                        <div className="refBalL">Margin</div>
                        <div className="refBalV">{fmtRefNum(profileMargin, 0)}</div>
                        <div className="refBalU">USDT</div>
                      </div>
                      <div className="refBalC">
                        <div className="refBalL">P/L session</div>
                        <div
                          className={`refBalV${
                            sessionPnl == null
                              ? ""
                              : sessionPnl < 0
                                ? " neg"
                                : sessionPnl > 0
                                  ? " pos"
                                  : ""
                          }`}
                        >
                          {sessionPnl == null
                            ? "—"
                            : `${sessionPnl > 0 ? "+" : sessionPnl < 0 ? "−" : ""}${fmtRefNum(Math.abs(sessionPnl), 0)}`}
                        </div>
                        <div className="refBalU">USDT</div>
                      </div>
                    </div>
                  </div>

                  <div className="sec-lbl dashAnim">Positions</div>
                  <div className="refCard dashAnim">
                    <div className="refPosHead">
                      <span>Symbol</span>
                      <span>Type</span>
                      <span>Vol</span>
                      <span>P/L</span>
                    </div>
                    {livePositions.length ? (
                      livePositions.map((p) => {
                        const pnl = p?.profit != null ? Number(p.profit) : null;
                        const side = String(p?.type || "").toUpperCase();
                        const sym = String(p?.symbol || "—");
                        const vol = p?.volume != null ? Number(p.volume) : null;
                        const key = String(p?.ticket || `${sym}-${side}-${vol ?? "x"}`);
                        return (
                          <div key={key} className="refPosRow">
                            <span>{sym}</span>
                            <span>{side || "—"}</span>
                            <span>{vol == null ? "—" : vol.toFixed(2)}</span>
                            <span
                              className={
                                pnl == null || pnl === 0
                                  ? ""
                                  : pnl > 0
                                    ? "refBalV pos"
                                    : "refBalV neg"
                              }
                            >
                              {pnl == null ? "—" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="refPosEmpty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                          <path d="M3 3v18h18" />
                          <path d="M7 14l4-4 3 3 5-6" />
                        </svg>
                        <div>No open positions</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {activeTab === "dashboard" && (
              <div key="dashboard" className="dashTabPane">
                {accounts.length > 0 && !brokerExpanded ? (
                  <div className="refConnected dashAnim">
                    <div className="refConnIc">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <path d="M5 12l5 5L20 6" />
                      </svg>
                    </div>
                    <div className="refConnInfo">
                      <div className="refConnSrv">{primaryAccount?.server || selectedServerName}</div>
                      <div className="refConnId">{primaryAccount?.login ?? "—"}</div>
                    </div>
                    <button
                      type="button"
                      className="refChange"
                      onClick={() => {
                        setBrokerExpanded(true);
                        setMsg("");
                        setConnectErr("");
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="sec-lbl dashAnim">Broker connection</div>
                    <div className="refCard dashAnim">
                      <div className="refCard-h">
                        <span className="refCard-t">Connect account</span>
                        {accounts.length > 0 ? (
                          <button type="button" className="refChange" onClick={cancelBrokerEdit}>
                            Back
                          </button>
                        ) : null}
                      </div>
                      <form onSubmit={submitBroker}>
                        <div className="refInputWrap">
                          <svg className="refIco" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <rect x="3" y="4" width="18" height="16" rx="2.5" />
                            <path d="M7 9h10M7 13h7" />
                          </svg>
                          <input
                            className={`refField${fieldErrors.server ? " isInvalid" : ""}`}
                            value={form.server}
                            placeholder="Server (e.g. MetaQuotes-Demo)"
                            autoComplete="off"
                            aria-label="Server"
                            disabled={connectSubmitting}
                            onChange={(e) => {
                              setConnectErr("");
                              setFieldErrors((fe) => ({ ...fe, server: false }));
                              setForm({ ...form, server: e.target.value });
                            }}
                          />
                        </div>
                        <div className="refInputWrap">
                          <svg className="refIco" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <circle cx="12" cy="8" r="4" />
                            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                          </svg>
                          <input
                            className={`refField${fieldErrors.login ? " isInvalid" : ""}`}
                            value={form.login}
                            placeholder="Login"
                            autoComplete="username"
                            aria-label="Login"
                            disabled={connectSubmitting}
                            onChange={(e) => {
                              setConnectErr("");
                              setFieldErrors((fe) => ({ ...fe, login: false }));
                              setForm({ ...form, login: e.target.value });
                            }}
                          />
                        </div>
                        <div className="refInputWrap">
                          <svg className="refIco" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <rect x="4" y="11" width="16" height="10" rx="2.5" />
                            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                          </svg>
                          <input
                            className={`refField refFieldPw${fieldErrors.password ? " isInvalid" : ""}`}
                            type={showConnectPassword ? "text" : "password"}
                            value={form.password}
                            placeholder="Password"
                            autoComplete="current-password"
                            aria-label="Password"
                            disabled={connectSubmitting}
                            onChange={(e) => {
                              setConnectErr("");
                              setFieldErrors((fe) => ({ ...fe, password: false }));
                              setForm({ ...form, password: e.target.value });
                            }}
                          />
                          <button
                            type="button"
                            className="refIco refIcoEye"
                            aria-label={showConnectPassword ? "Hide password" : "Show password"}
                            disabled={connectSubmitting}
                            onClick={() => setShowConnectPassword((v) => !v)}
                          >
                            <ConnectEyeIcon open={showConnectPassword} />
                          </button>
                        </div>
                        {(fieldErrors.server || fieldErrors.login || fieldErrors.password) && (
                          <div className="refConnectErr">Server, login, and password are required.</div>
                        )}
                        {connectErr ? (
                          <div className="refConnectErr" role="alert" key={connectErrBump}>
                            {connectErr}
                          </div>
                        ) : null}
                        {connectSubmitting ? (
                          <p className="refVerifyHint" aria-live="polite">
                            Authorizing with broker…
                          </p>
                        ) : null}
                        <button
                          className="refBtn refBtnLight"
                          type="submit"
                          disabled={connectSubmitting}
                        >
                          {connectSubmitting ? "Connecting…" : "Connect"}
                        </button>
                      </form>
                    </div>
                  </>
                )}

                {accounts.length > 0 && !brokerExpanded ? (
                  <div className="refCard dashAnim">
                    <div className="refCard-h">
                      <span className="refCard-t">Trading bot</span>
                      <div className={`badge-status${activeSessionForAccount ? " live" : ""}`}>
                        <span className="dot" />
                        <span>{activeSessionForAccount ? "Active" : "Inactive"}</span>
                      </div>
                    </div>
                    <div className="refTr">
                      <span className="refTr-k">Server</span>
                      <span className="refTr-v">
                        {selectedServerName}
                        <RowChevron />
                      </span>
                    </div>
                    <div className="refTr">
                      <span className="refTr-k">Strategy</span>
                      <span className="refTr-v">
                        {tierLabel || strategyLabel}
                        <RowChevron />
                      </span>
                    </div>
                    <div className="refTr">
                      <span className="refTr-k">Instrument</span>
                      <span className="refTr-v">
                        {TRADING_INSTRUMENT_LABEL}
                        <RowChevron />
                      </span>
                    </div>
                    <button
                      className={`refBtn ${
                        activeSessionForAccount ? "refBtnRed" : "refBtnGreen"
                      }`}
                      type="button"
                      onClick={
                        activeSessionForAccount
                          ? () => stop(activeSessionForAccount.id)
                          : start
                      }
                      disabled={
                        brokerChangeMode
                          ? !activeSessionForAccount
                          : activeSessionForAccount
                            ? postStartStopGuard || stopSubmitting
                            : marketStatus.closed || startSubmitting || !accounts.length
                      }
                    >
                      {activeSessionForAccount
                        ? stopSubmitting
                          ? "Stopping…"
                          : "Stop"
                        : startSubmitting
                          ? "Starting…"
                          : "Start"}
                    </button>
                    {!activeSessionForAccount && marketStatus.closed ? (
                      <div className="refMarket" role="status" aria-live="polite">
                        <span className="refMt">Market closed</span>
                        <span className="refMtx">
                          Weekend. Trading opens{" "}
                          <b>{marketStatus.nextOpenText || "Monday 09:00"}</b> (Berlin).
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="sec-lbl dashAnim">Top 5 traders of the day</div>
                <div className="refCard refCardPadTight dashAnim">
                  <div className="refLbHead">
                    <span>#</span>
                    <span>Trader</span>
                    <span>Profit</span>
                  </div>
                  <div className="refLbBody">
                    {leaderboardRows.map((row, idx) => (
                      <div
                        key={`${row.user}-${idx}`}
                        className={`refLbRow${leaderboardFlash ? " flash" : ""}`}
                      >
                        <span className="refLbRank">{idx + 1}</span>
                        <span className="refLbUser">{row.user}</span>
                        <span className="refLbProfit">{fmtLeaderboardUsd(row.profit)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="refLbFoot">Updated live · resets daily</div>
                </div>
              </div>
            )}
          </div>
        </main>

        <SubscriptionUpgradeFlow
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          currentTier={user?.subscription_tier}
          onRedeemCode={async (code) => {
            try {
              await api.redeemCode(code);
              onRefresh?.();
              return { ok: true };
            } catch (e) {
              return { ok: false, error: String(e.message || e) };
            }
          }}
          onEnsureAuth={async () => {}}
          onPaymentComplete={() => onRefresh?.()}
        />

        <footer className="dashFooterFixed" aria-hidden={hideTabBar}>
          <div className="dashFooter">
            <button
              type="button"
              className={`dashTabBtn ${activeTab === "dashboard" ? "isActive" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              <span className="dashTabIcon"><HomeTabIcon className="dashTabIconSvg" /></span>
              <span className="dashTabLabel">Home</span>
            </button>
            <button
              type="button"
              className={`dashTabBtn ${activeTab === "profile" ? "isActive" : ""}`}
              onClick={() => setActiveTab("profile")}
            >
              <span className="dashTabIcon"><ProfileTabIcon className="dashTabIconSvg" /></span>
              <span className="dashTabLabel">Profile</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
