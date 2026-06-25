import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import {
  applyTelegramViewportCss,
  getTelegramWebApp,
  isTelegramKeyboardOpen,
} from "./telegram_init.js";
import "./subscription_upgrade.css";

const DEFAULT_CHECKOUT = {
  wallet: "TGfxMFAXrcWQfHBFEguC428ncVzh69PrBt",
  network: "TRC-20",
};

const PURCHASE_TIER = "elite";

export const TIER_PLANS = {
  elite: {
    id: "elite",
    label: "PHASE ELITE",
    price: 249,
    note: "Full access · XAUUSD trading robot",
    features: [
      "XAUUSD trading robot access",
      "RSI grid with progressive lot",
      "Priority execution profile",
    ],
    badge: null,
  },
};

function planPrice(tierId, priceOverrides) {
  const p = priceOverrides?.[tierId]?.price_usdt;
  return p != null ? p : TIER_PLANS[tierId]?.price ?? 0;
}

function applyVerifyProgress(res, setVSteps, setRingPct) {
  const stage = res?.verify_stage;
  if (res?.status === "confirmed") {
    setVSteps([2, 2, 2]);
    setRingPct(100);
    return;
  }
  if (stage === "activating") {
    setVSteps([2, 2, 1]);
    setRingPct(88);
    return;
  }
  if (stage === "confirming") {
    setVSteps([2, 1, 0]);
    setRingPct(62);
    return;
  }
  if (stage === "broadcast") {
    setVSteps([2, 0, 0]);
    setRingPct(34);
    return;
  }
  setVSteps([1, 0, 0]);
  setRingPct(12);
}

function parseApiError(e) {
  const raw = String(e?.message || e || "");
  try {
    const j = JSON.parse(raw);
    if (typeof j === "string") return j;
    if (typeof j?.detail === "string") return j.detail;
  } catch {
    /* plain text */
  }
  return raw.replace(/^"|"$/g, "") || "Request failed";
}

function formatExpiry(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function fireConfetti(canvas) {
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  const W = parent.clientWidth;
  const H = parent.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const cols = ["#F0D285", "#D9B65A", "#B8923C", "#FFFFFF"];
  const particles = [];
  for (let i = 0; i < 80; i += 1) {
    particles.push({
      x: W / 2,
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 11 - 3,
      s: 4 + Math.random() * 5,
      c: cols[i % 4],
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3,
      a: 1,
    });
  }
  let t = 0;
  function loop() {
    ctx.clearRect(0, 0, W, H);
    t += 1;
    let alive = false;
    particles.forEach((p) => {
      p.vy += 0.28;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      if (t > 60) p.a -= 0.02;
      if (p.a > 0 && p.y < H + 20) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.a);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
    });
    if (alive) requestAnimationFrame(loop);
    else ctx.clearRect(0, 0, W, H);
  }
  loop();
}

export function ProfileSubscriptionCard({
  currentTier,
  tierLabel,
  accessExpiresAt,
  hasActiveAccess,
  onUpgrade,
}) {
  const plan = TIER_PLANS.elite;
  const tier = String(currentTier || "elite").toLowerCase();

  return (
    <div className="profileSubCard">
      <div className="profileSubCardHead">
        <span className="profileSubCardTitle">Subscription</span>
        {hasActiveAccess ? (
          <span className="profileSubBadge">
            <span className="dot" />
            Active
          </span>
        ) : (
          <span className="profileSubBadge" style={{ color: "#9494a0" }}>
            Inactive
          </span>
        )}
      </div>
      <div className="profileSubRow">
        <span className="profileSubRowK">Plan</span>
        <span className="profileSubRowV subUpgGoldTxt">
          {tierLabel || plan.label}
        </span>
      </div>
      <div className="profileSubRow">
        <span className="profileSubRowK">Price</span>
        <span className="profileSubRowV">${plan.price} / month</span>
      </div>
      <div className="profileSubRow">
        <span className="profileSubRowK">Valid until</span>
        <span className="profileSubRowV">{formatExpiry(accessExpiresAt)}</span>
      </div>
      <button
        type="button"
        className="subUpgBtnGold profileSubUpgradeBtn"
        onClick={onUpgrade}
      >
        Renew plan
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

export default function SubscriptionUpgradeFlow({
  open,
  onClose,
  currentTier,
  onRedeemCode,
  onEnsureAuth,
  onPaymentComplete,
}) {
  const [scene, setScene] = useState("plans");
  const [selectedTier, setSelectedTier] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [hashErr, setHashErr] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const [step, setStep] = useState(1);
  const [ringPct, setRingPct] = useState(0);
  const [ringFail, setRingFail] = useState(false);
  const [vSteps, setVSteps] = useState([0, 0, 0]);
  const [licenseKey, setLicenseKey] = useState("");
  const [activateErr, setActivateErr] = useState("");
  const [activating, setActivating] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [checkout, setCheckout] = useState(DEFAULT_CHECKOUT);
  const [tierPrices, setTierPrices] = useState(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const verifyTimers = useRef([]);
  const pollCancelRef = useRef(false);
  const confettiRef = useRef(null);
  const hashInputRef = useRef(null);
  const scrollRef = useRef(null);

  const reset = useCallback(() => {
    verifyTimers.current.forEach(clearTimeout);
    verifyTimers.current = [];
    pollCancelRef.current = true;
    setScene("checkout");
    setSelectedTier(PURCHASE_TIER);
    setTxHash("");
    setHashErr(false);
    setCopyOk(false);
    setStep(1);
    setRingPct(0);
    setRingFail(false);
    setVSteps([0, 0, 0]);
    setLicenseKey("");
    setActivateErr("");
    setActivating(false);
    setPaymentDone(false);
    setFailReason("");
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    pollCancelRef.current = false;
    setSelectedTier(PURCHASE_TIER);
    setScene("checkout");
    api
      .paymentsConfig()
      .then((cfg) => {
        if (!cfg) return;
        setCheckout({
          wallet: cfg.wallet || DEFAULT_CHECKOUT.wallet,
          network: cfg.network || DEFAULT_CHECKOUT.network,
        });
        if (cfg.tiers) setTierPrices(cfg.tiers);
      })
      .catch(() => {});
  }, [open, reset]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setKeyboardOpen(false);
      return undefined;
    }

    const tg = getTelegramWebApp();
    const syncViewport = () => {
      applyTelegramViewportCss(tg);
      setKeyboardOpen(isTelegramKeyboardOpen(tg));
    };

    syncViewport();
    tg?.onEvent?.("viewportChanged", syncViewport);
    window.addEventListener("resize", syncViewport);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);

    return () => {
      window.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("resize", syncViewport);
    };
  }, [open]);

  useEffect(() => {
    if (scene === "success" && confettiRef.current) {
      fireConfetti(confettiRef.current);
    }
  }, [scene]);

  if (!open) return null;

  const plan = TIER_PLANS[PURCHASE_TIER];
  const checkoutPrice = planPrice(PURCHASE_TIER, tierPrices);

  function markStep(n) {
    setStep(n);
  }

  function markAllStepsDone() {
    setStep(4);
  }

  function copyWallet() {
    navigator.clipboard?.writeText(checkout.wallet).catch(() => {});
    setCopyOk(true);
    markStep(2);
    setTimeout(() => setCopyOk(false), 2000);
  }

  function verifyPayment() {
    const h = txHash.trim();
    if (h.length < 10) {
      setHashErr(true);
      return;
    }
    if (!selectedTier) return;
    setHashErr(false);
    markAllStepsDone();
    setScene("verify");
    startVerify(h, PURCHASE_TIER);
  }

  function finishConfirmed(res) {
    setPaymentDone(true);
    setLicenseKey(res?.code || "");
    setScene("success");
    onPaymentComplete?.(res);
  }

  function finishFailed(message) {
    setFailReason(message || "Payment not confirmed");
    setRingFail(true);
    setScene("failed");
  }

  async function pollPayment(hash, tier) {
    const maxAttempts = 25;
    for (let i = 0; i < maxAttempts; i += 1) {
      if (pollCancelRef.current) return;
      try {
        const res = await api.verifyPayment(hash, tier);
        applyVerifyProgress(res, setVSteps, setRingPct);
        if (res.status === "confirmed") {
          finishConfirmed(res);
          return;
        }
        if (res.status === "failed") {
          finishFailed(res.message);
          return;
        }
      } catch (e) {
        if (e?.status === 409) {
          finishFailed("This transaction hash was already used by another account.");
          return;
        }
        if (i === maxAttempts - 1) {
          finishFailed(parseApiError(e));
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
    finishFailed("Payment is still pending. Wait for confirmations and try again.");
  }

  function startVerify(hash, tier) {
    verifyTimers.current.forEach(clearTimeout);
    verifyTimers.current = [];
    pollCancelRef.current = false;
    setRingPct(0);
    setRingFail(false);
    setFailReason("");
    setVSteps([1, 0, 0]);

    (async () => {
      try {
        if (onEnsureAuth) await onEnsureAuth();
        await pollPayment(hash, tier);
      } catch (e) {
        finishFailed(parseApiError(e));
      }
    })();
  }

  function focusHashField() {
    const el = hashInputRef.current;
    const scroller = scrollRef.current;
    if (!el) return;
    applyTelegramViewportCss();
    window.setTimeout(() => {
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        /* input only */
      }
    }, 320);
  }

  function closeFlow() {
    pollCancelRef.current = true;
    verifyTimers.current.forEach(clearTimeout);
    verifyTimers.current = [];
    onClose?.();
  }

  async function activateKey() {
    const code = licenseKey.trim();
    if (!code) {
      setActivateErr("Paste your license key to activate.");
      return;
    }
    setActivating(true);
    setActivateErr("");
    try {
      const res = await onRedeemCode?.(code);
      if (res && res.ok === false) {
        setActivateErr(res.error || "Activation failed");
        return;
      }
      onClose?.();
    } catch (e) {
      setActivateErr(String(e.message || e));
    } finally {
      setActivating(false);
    }
  }

  function back() {
    if (scene === "verify") {
      pollCancelRef.current = true;
      setScene("checkout");
      return;
    }
    if (scene === "failed") {
      setScene("checkout");
      return;
    }
    if (scene === "success") {
      onClose?.();
      return;
    }
    closeFlow();
  }

  const ringOffset = 295 - (295 * ringPct) / 100;

  return (
    <div
      className={`subUpgOverlay${keyboardOpen ? " subUpgKeyboardOpen" : ""}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="subUpgShell">
        <div className="subUpgHdr">
          <span className="subUpgHdrTitle">
            {scene === "checkout" && "Checkout"}
            {scene === "verify" && "Verification"}
            {scene === "success" && "Confirmed"}
            {scene === "failed" && "Payment"}
          </span>
          <button type="button" className="subUpgBack" onClick={back}>
            {scene === "checkout" || scene === "verify" ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
                Close
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back
              </>
            )}
          </button>
        </div>

        {scene === "checkout" && plan && (
          <div className="subUpgScroll" ref={scrollRef}>
            <div className="subUpgStepper subUpgAnim">
              <div className={`subUpgStep${step === 1 ? " on" : ""}${step > 1 ? " done" : ""}`}>
                <div className="subUpgStepDot">{step > 1 ? "✓" : "1"}</div>
                <div className="subUpgStepLbl">Copy</div>
              </div>
              <div className={`subUpgStepBar${step > 1 ? " fill" : ""}`}>
                <i />
              </div>
              <div className={`subUpgStep${step === 2 ? " on" : ""}${step > 2 ? " done" : ""}`}>
                <div className="subUpgStepDot">{step > 2 ? "✓" : "2"}</div>
                <div className="subUpgStepLbl">Send</div>
              </div>
              <div className={`subUpgStepBar${step > 2 ? " fill" : ""}`}>
                <i />
              </div>
              <div className={`subUpgStep${step === 3 ? " on" : ""}${step > 3 ? " done" : ""}`}>
                <div className="subUpgStepDot">{step > 3 ? "✓" : "3"}</div>
                <div className="subUpgStepLbl">Verify</div>
              </div>
            </div>

            <div className="subUpgPayBlock gold subUpgAnim">
              <div className="subUpgPayTop">
                <span className="subUpgPayLbl">Amount to pay</span>
                <span className="subUpgPayNet">USDT · {checkout.network}</span>
              </div>
              <div className="subUpgPayAmount">
                ${checkoutPrice} <span>USDT</span>
              </div>
              <div className="subUpgPlanNote" style={{ marginTop: 8 }}>
                {plan.label}
              </div>
            </div>

            <div className="subUpgPayBlock subUpgAnim">
              <div className="subUpgPayLbl">Wallet address</div>
              <div className="subUpgPayAddr">{checkout.wallet}</div>
              <button
                type="button"
                className={`subUpgCopy${copyOk ? " ok" : ""}`}
                onClick={copyWallet}
              >
                {copyOk ? "Copied" : "Copy address"}
              </button>
            </div>

            <div className="subUpgHint subUpgAnim">
              <span>ℹ️</span>
              <p>
                Send <b>${checkoutPrice} USDT</b> on <b>{checkout.network}</b>. Then paste the
                transaction hash below to verify.
              </p>
            </div>

            <div className="subUpgPayLbl subUpgAnim">Transaction hash</div>
            <div className="subUpgFieldWrap subUpgAnim">
              <input
                ref={hashInputRef}
                className="subUpgField"
                value={txHash}
                placeholder="Paste hash after payment"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="text"
                onFocus={focusHashField}
                onChange={(e) => {
                  setTxHash(e.target.value);
                  if (e.target.value.trim().length > 10) markStep(3);
                }}
              />
            </div>
            <div className={`subUpgFieldErr${hashErr ? " show" : ""}`}>
              Please paste your transaction hash first.
            </div>

            <button type="button" className="subUpgBtnGold subUpgAnim" onClick={verifyPayment}>
              Verify payment
            </button>
          </div>
        )}

        {scene === "verify" && (
          <div className="subUpgVerifyWrap">
            <div className="subUpgRing">
              <svg width="108" height="108" viewBox="0 0 108 108">
                <defs>
                  <linearGradient id="subUpgGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#F0D285" />
                    <stop offset="1" stopColor="#B8923C" />
                  </linearGradient>
                </defs>
                <circle
                  cx="54"
                  cy="54"
                  r="47"
                  fill="none"
                  stroke="#222229"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                <circle
                  cx="54"
                  cy="54"
                  r="47"
                  fill="none"
                  stroke={ringFail ? "#FF453A" : "url(#subUpgGrad)"}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray="295"
                  strokeDashoffset={ringOffset}
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              </svg>
              <div className={`subUpgRingPct${ringFail ? " fail" : ""}`}>
                {ringFail ? "!" : `${Math.round(ringPct)}%`}
              </div>
            </div>
            <div className="subUpgVTitle">Confirming payment</div>
            <div className="subUpgVSub">
              Verifying your transaction on the blockchain. This can take up to 10 minutes.
            </div>
            <div className="subUpgVSteps">
              {[
                ["Transaction broadcast", "Looking up hash on TRON network"],
                ["Block confirmation", "Waiting for block confirmations"],
                ["License activation", "Activating your subscription"],
              ].map(([name, defaultMeta], i) => {
                const st = vSteps[i];
                const cls =
                  st === 3 ? " fail" : st === 2 ? " ok" : st === 1 ? " on" : "";
                const meta =
                  st === 2
                    ? i === 0
                      ? "Found on TRON network"
                      : i === 1
                        ? "Payment amount confirmed"
                        : "Subscription activated"
                    : st === 1
                      ? i === 0
                        ? "Checking blockchain..."
                        : i === 1
                          ? "Awaiting confirmations..."
                          : "Applying license key..."
                      : defaultMeta;
                return (
                  <div key={name} className={`subUpgVStep${cls}`}>
                    <div className="subUpgVStepIco">●</div>
                    <div className="subUpgVStepTxt">
                      <div className="subUpgVStepName">{name}</div>
                      <div className="subUpgVStepMeta">{meta}</div>
                    </div>
                    <div className="subUpgMiniSpin" />
                    <svg className="subUpgVsCheck" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12l5 5L20 6" />
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {scene === "success" && plan && (
          <div className="subUpgSuccessWrap">
            <canvas ref={confettiRef} className="subUpgConfetti" />
            <div className="subUpgSCheck">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="subUpgSTitle">Payment confirmed</h1>
            <div className="subUpgSPlan">
              <div className="subUpgPayLbl">Active plan</div>
              <div className="subUpgPlanName subUpgGoldTxt" style={{ fontSize: 18 }}>
                {plan.label}
              </div>
              <div className="subUpgPlanNote">
                {paymentDone
                  ? "Your subscription is active. Save the license key below."
                  : "Paste the license key you received after payment."}
              </div>
            </div>
            {licenseKey ? (
              <div className="subUpgSKey">
                <div className="subUpgSKeyLbl">License key</div>
                <input
                  className="subUpgField"
                  value={licenseKey}
                  readOnly={paymentDone}
                  placeholder="Paste license key"
                  onChange={(e) => {
                    if (paymentDone) return;
                    setLicenseKey(e.target.value);
                    setActivateErr("");
                  }}
                />
                <div className="subUpgSKeyNote">
                  {paymentDone
                    ? "Keep this key — each transaction hash can only be used once."
                    : "Save it — the key upgrades your subscription tier after activation."}
                </div>
              </div>
            ) : null}
            {activateErr ? (
              <div className="subUpgActivateErr">{activateErr}</div>
            ) : null}
            {paymentDone ? (
              <button
                type="button"
                className="subUpgBtnGold"
                style={{ maxWidth: 290, zIndex: 2 }}
                onClick={() => onClose?.()}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                className="subUpgBtnGold"
                style={{ maxWidth: 290, zIndex: 2 }}
                disabled={activating}
                onClick={activateKey}
              >
                {activating ? "Activating…" : "Activate upgrade"}
              </button>
            )}
          </div>
        )}

        {scene === "failed" && (
          <div className="subUpgFailWrap">
            <div className="subUpgFX">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </div>
            <h1 className="subUpgFTitle">Payment not confirmed</h1>
            <p className="subUpgFSub">
              {failReason ||
                "We couldn't match this transaction yet. It may still be unconfirmed, or the amount or network didn't match."}
            </p>
            <button
              type="button"
              className="subUpgBtnGold"
              style={{ maxWidth: 300 }}
              onClick={() => {
                if (selectedTier && txHash.trim()) {
                  setScene("verify");
                  startVerify(txHash.trim(), PURCHASE_TIER);
                } else {
                  setScene("checkout");
                }
              }}
            >
              Try again
            </button>
            <button type="button" className="subUpgBtnGhost" onClick={() => setScene("checkout")}>
              Edit transaction hash
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
