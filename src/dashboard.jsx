import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { getTelegramUser } from "./telegram_init.js";

const emptyForm = {
  broker_name: "",
  login: "",
  password: "",
  server: "",
  risk_percent: 1,
};

const SYMBOL_GROUPS = {
  Forex: ["EURUSD", "GBPUSD", "USDCAD", "USDJPY", "AUDUSD", "NZDUSD"],
  Metals: ["XAUUSD", "XAGUSD"],
  Indices: ["GER40", "US30", "US100", "NASDAQ"],
  Crypto: ["BTCUSD", "ETHUSD"],
};

function ProfileFallbackIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.2" fill="currentColor" />
      <path
        d="M12 13.2c-3.15 0-5.56 1.86-6.02 4.63-.08.5.31.97.82.97h10.4c.51 0 .9-.47.82-.97-.46-2.77-2.87-4.63-6.02-4.63Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ProfileRefreshIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function ProfilePencilIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ConnectServerIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="4" rx="1.5" />
      <rect x="3" y="10" width="18" height="4" rx="1.5" />
      <rect x="3" y="16" width="18" height="4" rx="1.5" />
    </svg>
  );
}

function ConnectUserIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ConnectLockIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ConnectEyeIcon({ open, className = "" }) {
  if (open) {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function HomeTabIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 3L4 10v10h5v-6h6v6h5V10l-8-7z" />
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
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="5" />
    </svg>
  );
}

export default function Dashboard({ user, refreshKey, onRefresh }) {
  const [sessions, setSessions] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [strategy, setStrategy] = useState("PHASE MEDIUM");
  const [selectedSymbols, setSelectedSymbols] = useState(["EURUSD"]);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyDraft, setStrategyDraft] = useState(strategy);
  const openStrategyModal = () => {
    setStrategyDraft(strategy);
    setStrategyModalOpen(true);
  };
  const closeStrategyModal = () => {
    setStrategyModalOpen(false);
  };
  const applyStrategyModal = () => {
    setStrategy(strategyDraft);
    setStrategyModalOpen(false);
  };
  const [symbolsModalOpen, setSymbolsModalOpen] = useState(false);
  const [activeSymbolGroup, setActiveSymbolGroup] = useState("All");
  const [symbolsDraft, setSymbolsDraft] = useState([]);

  // server selection modal removed (connect broker only)

  const openSymbolsModal = () => {
    setSymbolsDraft([...selectedSymbols]);
    setSymbolsModalOpen(true);
  };

  const openServersModal = () => {
    setServerSearch("");
    setServersModalOpen(true);
    // avoid stacking multiple modals
    setSymbolsModalOpen(false);
    setStrategyModalOpen(false);
  };

  const closeServersModal = () => {
    setServersModalOpen(false);
  };


  const closeSymbolsModal = () => {
    setSymbolsModalOpen(false);
  };

  const applySymbolsModal = () => {
    setSelectedSymbols(symbolsDraft);
    setSymbolsModalOpen(false);
  };

  const toggleDraftSymbol = (sym) => {
    setSymbolsDraft((prev) =>
      prev.includes(sym) ? prev.filter((x) => x !== sym) : [...prev, sym]
    );
  };

  const avatarInputRef = useRef(null);
  const [avatarOverrideDataUrl, setAvatarOverrideDataUrl] = useState(() => {
    try {
      return localStorage.getItem("profile_avatar_override_dataurl") || "";
    } catch {
      return "";
    }
  });
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [usernameOverride, setUsernameOverride] = useState(() => {
    try {
      return localStorage.getItem("profile_username_override") || "";
    } catch {
      return "";
    }
  });
  const [usernameDraft, setUsernameDraft] = useState("");
  const [brokerExpanded, setBrokerExpanded] = useState(true);
  const [connectSubmitting, setConnectSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ server: false, login: false, password: false });
  const [showConnectPassword, setShowConnectPassword] = useState(false);
  const brokerListHydrated = useRef(false);
  const tgUser = getTelegramUser();

  async function load() {
    setErr("");
    try {
      const [s, b] = await Promise.all([api.sessions(), api.listBrokers()]);
      setSessions(s);
      setAccounts(b);
      if (b.length && !accountId) setAccountId(String(b[0].id));
      if (b.length === 0) {
        setBrokerExpanded(true);
      } else if (!brokerListHydrated.current) {
        brokerListHydrated.current = true;
        setBrokerExpanded(false);
      }
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function start() {
    setErr("");
    try {
      await api.startTrading(Number(accountId), selectedSymbols);
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  async function stop(id) {
    setErr("");
    try {
      await api.stopTrading(id);
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  async function submitBroker(e) {
    e.preventDefault();
    setErr("");
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
    try {
      const brokerName = (form.broker_name || server || "Broker").trim().slice(0, 128);
      const created = await api.addBroker({
        ...form,
        broker_name: brokerName,
        server,
        login,
        password,
        risk_percent: Number(form.risk_percent),
      });
      if (created?.id != null) {
        setAccountId(String(created.id));
      }
      setForm(emptyForm);
      setMsg("Linked");
      setBrokerExpanded(false);
      brokerListHydrated.current = true;
      await load();
      onRefresh?.();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setConnectSubmitting(false);
    }
  }

  async function refreshProfileData() {
    await load();
    onRefresh?.();
  }

  const totalPnl = sessions
    .filter((s) => s.pnl !== null && s.pnl !== undefined)
    .reduce((acc, s) => acc + Number(s.pnl), 0);

  const openSessions = sessions.filter(
    (s) => s.state === "running" || s.state === "queued"
  );

  const runningCount = sessions.filter(
    (s) => s.state === "running" || s.state === "queued"
  ).length;

  let daysLeft = null;
  if (user.access_expires_at) {
    const diff = new Date(user.access_expires_at).getTime() - Date.now();
    daysLeft = Math.max(0, Math.ceil(diff / 86400000));
  }

  const fullName = [tgUser?.first_name, tgUser?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const telegramUsername = tgUser?.username ? `@${tgUser.username}` : "";
  const profileName = usernameOverride
    ? usernameOverride
    : fullName || telegramUsername || "User";

  const telegramAvatar = tgUser?.photo_url || "";
  const profileAvatar = avatarOverrideDataUrl || telegramAvatar;

  function onProfileAvatarFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      setAvatarOverrideDataUrl(dataUrl);
      try {
        localStorage.setItem("profile_avatar_override_dataurl", dataUrl);
      } catch {
        // ignore storage errors
      }
    };
    reader.readAsDataURL(file);
  }

  function openProfileEdit() {
    const base = usernameOverride || telegramUsername || "";
    setUsernameDraft(base);
    setProfileEditOpen(true);
  }

  function closeProfileEdit() {
    setProfileEditOpen(false);
  }

  function applyProfileEdit() {
    const raw = String(usernameDraft || "").trim();
    const cleaned = raw.startsWith("@") ? raw.slice(1) : raw;
    if (!cleaned) {
      setUsernameOverride("");
      try {
        localStorage.removeItem("profile_username_override");
      } catch {
        // ignore
      }
      setProfileEditOpen(false);
      return;
    }
    const normalized = `@${cleaned}`;
    setUsernameOverride(normalized);
    try {
      localStorage.setItem("profile_username_override", normalized);
    } catch {
      // ignore
    }
    setProfileEditOpen(false);
  }
  const selectedBrokerName = accounts.find((a) => String(a.id) === String(accountId))?.broker_name || "Demo";
  const selectedServerName = accounts.find((a) => String(a.id) === String(accountId))?.server || "Demo";
  const primaryAccount = accounts.find((a) => String(a.id) === String(accountId)) || accounts[0];
  const connectSummary =
    primaryAccount != null
      ? `${primaryAccount.broker_name} · ${primaryAccount.login}`
      : "";

  return (
    <div className="dashRoot">
      <div className="dashShell">
        <header className="dashHeaderFixed">
          <div className="dashHeader">
            <div className="dashHeaderBrand">
              <img src="/logo.png" alt="Logo" className="dashHeaderLogo" />
              <span>PHASE TRADE ROBOT</span>
            </div>
          </div>
        </header>

        <main className="dashContent">
          <div className="dashPanel">
            {err && <div className="licenseErr">{err}</div>}
            {msg && <div className="dashMsg">{msg}</div>}

            {activeTab === "profile" && (
              <div key="profile" className="dashTabPane">
                <div className="profilePage">
                  <div className="profileHeroBlock">
                    <div className="profileAvatarWrap">
                      {profileAvatar ? (
                        <img src={profileAvatar} alt="" className="profileAvatarRef" />
                      ) : (
                        <div className="profileAvatarRef profileAvatarRefFallback">
                          <ProfileFallbackIcon className="profileRefFallbackSvg" />
                        </div>
                      )}
                      <button
                        type="button"
                        className="profileAvatarEdit"
                        aria-label="Edit photo"
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <ProfilePencilIcon className="profileAvatarEditSvg" />
                      </button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={onProfileAvatarFileChange}
                      />
                    </div>
                    <div className="profileDisplayName">{profileName}</div>
                    <button
                      type="button"
                      className="profileEditOutline"
                      onClick={openProfileEdit}
                    >
                      Edit Profile
                    </button>
                  </div>

                  {profileEditOpen && (
                    <div
                      className="dashModalOverlay"
                      role="dialog"
                      aria-modal="true"
                      onClick={closeProfileEdit}
                    >
                      <div
                        className="dashModalCard"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="dashModalHead">
                          <div className="dashModalTitle">
                            Edit username
                          </div>
                          <button
                            type="button"
                            className="dashModalClose"
                            onClick={closeProfileEdit}
                            aria-label="Close"
                          >
                            ×
                          </button>
                        </div>

                        <div className="dashModalBody">
                          <div className="dashConnectInputShell">
                            <input
                              className="dashConnectInput"
                              placeholder="Username"
                              value={usernameDraft}
                              onChange={(e) => setUsernameDraft(e.target.value)}
                              autoComplete="off"
                            />
                          </div>
                        </div>

                        <div className="dashModalActions">
                          <button
                            type="button"
                            className="dashModalBtn dashModalBtnSecondary"
                            onClick={closeProfileEdit}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="dashModalBtn dashModalBtnPrimary"
                            onClick={applyProfileEdit}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="profileRefCard">
                    <div className="profileRefCardHead">
                      <span className="profileRefCardTitle">Balance</span>
                      <button
                        type="button"
                        className="profileIconCircleBtn"
                        onClick={refreshProfileData}
                        aria-label="Refresh balance"
                      >
                        <ProfileRefreshIcon className="profileIconCircleSvg" />
                      </button>
                    </div>
                    <div className="profileRefRows">
                      <div className="profileRefRow">
                        <span className="profileRefLabel">Balance</span>
                        <span className="profileRefValue">0.00 USDT</span>
                      </div>
                      <div className="profileRefRow">
                        <span className="profileRefLabel">Equity</span>
                        <span className="profileRefValue">0.00 USDT</span>
                      </div>
                      <div className="profileRefRow">
                        <span className="profileRefLabel">Margin</span>
                        <span className="profileRefValue">0</span>
                      </div>
                      <div className="profileRefRow profileRefRowLast">
                        <span className="profileRefLabel">Profit</span>
                        <span
                          className={
                            totalPnl > 0
                              ? "profileRefValue profileRefValuePos"
                              : totalPnl < 0
                                ? "profileRefValue profileRefValueNeg"
                                : "profileRefValue profileRefValuePos"
                          }
                        >
                          {totalPnl > 0 ? "+" : ""}
                          {totalPnl.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="profileRefCard">
                    <div className="profileRefCardHead">
                      <span className="profileRefCardTitle">Positions</span>
                      <button
                        type="button"
                        className="profileRefreshOutlineBtn"
                        onClick={refreshProfileData}
                        aria-label="Refresh positions"
                      >
                        Refresh
                      </button>
                    </div>
                    <div className="profilePosTable">
                      <div className="profilePosColHead">
                        <span>SYM</span>
                        <span>TYPE</span>
                        <span>VOL</span>
                        <span>P/L</span>
                      </div>
                      {openSessions.length ? (
                        <div className="profilePosBody">
                          {openSessions.map((s) => {
                            const p = s.pnl != null ? Number(s.pnl) : null;
                            return (
                              <div key={s.id} className="profilePosRow">
                                <span>XAUUSD</span>
                                <span>BOT</span>
                                <span>—</span>
                                <span
                                  className={
                                    p == null || p === 0
                                      ? "profileRefValue"
                                      : p > 0
                                        ? "profileRefValue profileRefValuePos"
                                        : "profileRefValue profileRefValueNeg"
                                  }
                                >
                                  {p == null ? "—" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="profilePosEmpty">No open positions</p>
                      )}
                    </div>
                  </div>

                  <p className="profileFootNote">
                    Access {user.has_access ? "active" : "inactive"}
                    {daysLeft !== null ? ` · ${daysLeft} days left` : ""}
                    {` · Sessions ${runningCount}`}
                  </p>
                </div>
              </div>
            )}
            {activeTab === "dashboard" && (
              <div key="dashboard" className="dashTabPane">
                <section className="dashConnectSection">
                  <div className="dashCard dashCardConnect dashCardConnectRef">
                    {accounts.length > 0 && !brokerExpanded && (
                      <div className="dashConnectSummary dashConnectSummaryInCard">
                        <p className="dashConnectSummaryText">
                          Connected as <span className="dashConnectSummaryStrong">{connectSummary}</span>
                        </p>
                        <button
                          type="button"
                          className="dashConnectSummaryChange"
                          onClick={() => {
                            setBrokerExpanded(true);
                            setMsg("");
                          }}
                        >
                          Change
                        </button>
                      </div>
                    )}
                    {(accounts.length === 0 || brokerExpanded) && (
                      <>
                        <div className="dashCardTitleRow dashConnectInnerTitle">
                          <h2>Connect Broker</h2>
                        </div>
                        <form className="dashConnectFormStack" onSubmit={submitBroker}>
                          <div className={`dashConnectFieldGroup${fieldErrors.server ? " isInvalid" : ""}`}>
                            <div className="dashConnectInputShell dashConnectInputShellIcon">
                              <span className="dashConnectInputLeadIcon" aria-hidden>
                                <ConnectServerIcon className="dashConnectInputSvg" />
                              </span>
                              <input
                                className="dashConnectInput dashConnectInputPadded"
                                value={form.server}
                                placeholder="Enter server"
                                autoComplete="off"
                                aria-label="Server"
                                onChange={(e) => {
                                  setFieldErrors((fe) => ({ ...fe, server: false }));
                                  setForm({ ...form, server: e.target.value });
                                }}
                              />
                            </div>
                          </div>
                          <div className={`dashConnectFieldGroup${fieldErrors.login ? " isInvalid" : ""}`}>
                            <div className="dashConnectInputShell dashConnectInputShellIcon">
                              <span className="dashConnectInputLeadIcon" aria-hidden>
                                <ConnectUserIcon className="dashConnectInputSvg" />
                              </span>
                              <input
                                className="dashConnectInput dashConnectInputPadded"
                                value={form.login}
                                placeholder="Enter login"
                                autoComplete="username"
                                aria-label="Login"
                                onChange={(e) => {
                                  setFieldErrors((fe) => ({ ...fe, login: false }));
                                  setForm({ ...form, login: e.target.value });
                                }}
                              />
                            </div>
                          </div>
                          <div className={`dashConnectFieldGroup${fieldErrors.password ? " isInvalid" : ""}`}>
                            <div className="dashConnectInputShell dashConnectInputShellIcon dashConnectInputShellPw">
                              <span className="dashConnectInputLeadIcon" aria-hidden>
                                <ConnectLockIcon className="dashConnectInputSvg" />
                              </span>
                              <input
                                className="dashConnectInput dashConnectInputPadded"
                                type={showConnectPassword ? "text" : "password"}
                                value={form.password}
                                placeholder="Password"
                                autoComplete="current-password"
                                aria-label="Password"
                                onChange={(e) => {
                                  setFieldErrors((fe) => ({ ...fe, password: false }));
                                  setForm({ ...form, password: e.target.value });
                                }}
                              />
                              <button
                                type="button"
                                className="dashConnectPwToggle"
                                aria-label={showConnectPassword ? "Hide password" : "Show password"}
                                onClick={() => setShowConnectPassword((v) => !v)}
                              >
                                <ConnectEyeIcon open={showConnectPassword} className="dashConnectInputSvg" />
                              </button>
                            </div>
                          </div>
                          {(fieldErrors.server || fieldErrors.login || fieldErrors.password) && (
                            <div className="dashConnectValidationMsg">
                              Server, login, and password are required.
                            </div>
                          )}
                          <button
                            className="dashConnectSubmitBtn"
                            type="submit"
                            disabled={connectSubmitting}
                          >
                            <span className="dashConnectSubmitLabel">
                              {connectSubmitting ? "Connecting…" : "Connect"}
                            </span>
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </section>

                <div className="dashCard dashCardBot">
                  <div className="dashCardHead dashCardHeadBot">
                    <h2>Trading Bot</h2>
                    <span className={runningCount > 0 ? "dashStatusGreen" : "dashStatusMuted"}>
                      {runningCount > 0 ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="dashField dashBotRow dashBotRowBroker">
                    <div className="dashFieldBody">
                      <label>Server</label>
                      <span
                        className="dashBotRowValue"
                      >
                        {selectedServerName}
                      </span>
                    </div>
                    <span className="dashFieldChevron">›</span>
                  </div>

                  {/* server selection modal removed */}
                  <div className="dashField dashBotRow">
                    <div className="dashFieldBody">
                      <label>Strategy</label>
                      <div
                        className="dashCurrencyDisplay"
                        role="button"
                        tabIndex={0}
                        onClick={openStrategyModal}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ")
                            openStrategyModal();
                        }}
                      >
                        {strategy}
                      </div>
                    </div>
                    <span className="dashFieldChevron">›</span>
                  </div>

                  {strategyModalOpen && (
                    <div
                      className="dashModalOverlay"
                      role="dialog"
                      aria-modal="true"
                      onClick={closeStrategyModal}
                    >
                      <div
                        className="dashModalCard"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="dashModalHead">
                          <div className="dashModalTitle">Select strategy</div>
                          <button
                            type="button"
                            className="dashModalClose"
                            onClick={closeStrategyModal}
                            aria-label="Close"
                          >
                            ×
                          </button>
                        </div>

                        <div className="dashModalBody">
                          <div className="dashSymbolsPills">
                            {[
                              "PHASE AGGRESSIVE",
                              "PHASE MEDIUM",
                              "PHASE CONSERVATIVE",
                            ].map((s) => {
                              const isOn = strategyDraft === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  className={`dashSymbolPill${
                                    isOn ? " isActive" : ""
                                  }`}
                                  onClick={() => setStrategyDraft(s)}
                                >
                                  {s}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="dashModalActions">
                          <button
                            type="button"
                            className="dashModalBtn dashModalBtnSecondary"
                            onClick={closeStrategyModal}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="dashModalBtn dashModalBtnPrimary"
                            onClick={applyStrategyModal}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="dashField dashBotRow">
                    <div className="dashFieldBody">
                      <label>Currency</label>
                      <div
                        className="dashCurrencyDisplay"
                        role="button"
                        tabIndex={0}
                        onClick={openSymbolsModal}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") openSymbolsModal();
                        }}
                      >
                        {activeSymbolGroup === "All" ? "All pairs" : activeSymbolGroup}
                      </div>
                    </div>
                    <span
                      className="dashFieldChevron"
                      role="button"
                      tabIndex={0}
                      onClick={openSymbolsModal}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openSymbolsModal();
                      }}
                    >
                      ›
                    </span>
                  </div>

                  {symbolsModalOpen && (
                    <div
                      className="dashModalOverlay"
                      role="dialog"
                      aria-modal="true"
                      onClick={closeSymbolsModal}
                    >
                      <div
                        className="dashModalCard"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="dashModalHead">
                          <div className="dashModalTitle">
                            Select pairs
                          </div>
                          <button
                            type="button"
                            className="dashModalClose"
                            onClick={closeSymbolsModal}
                            aria-label="Close"
                          >
                            ×
                          </button>
                        </div>

                        <div className="dashModalBody">
                          {Object.entries(SYMBOL_GROUPS).map(([group, syms]) => (
                            <div key={group} className="dashSymbolsGroup">
                              <div className="dashSymbolsGroupTitle">
                                {group}
                              </div>
                              <div className="dashSymbolsPills">
                                {syms.map((sym) => {
                                  const isOn = symbolsDraft.includes(sym);
                                  return (
                                    <button
                                      key={sym}
                                      type="button"
                                      className={`dashSymbolPill${
                                        isOn ? " isActive" : ""
                                      }`}
                                      onClick={() => toggleDraftSymbol(sym)}
                                    >
                                      {sym}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="dashModalActions">
                          <button
                            type="button"
                            className="dashModalBtn dashModalBtnSecondary"
                            onClick={closeSymbolsModal}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="dashModalBtn dashModalBtnPrimary"
                            onClick={applySymbolsModal}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <button
                    className="licenseBtn dashWideBtn dashStartBtn dashBotStartBtn"
                    type="button"
                    onClick={start}
                    disabled={!accounts.length || selectedSymbols.length === 0}
                  >
                    <span className="licenseBtnLabel">Start</span>
                  </button>
                  {!accounts.length ? (
                    <p className="dashStartHint">Connect a broker first</p>
                  ) : null}
                  {sessions
                    .filter((s) => s.state === "running" || s.state === "queued")
                    .map((s) => (
                      <button
                        key={s.id}
                        className="licenseBtn dashWideBtn dashBotStopBtn"
                        type="button"
                        onClick={() => stop(s.id)}
                      >
                        <span className="licenseBtnLabel">STOP SESSION #{s.id}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="dashFooterFixed">
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
