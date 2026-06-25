import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import "./subscription_upgrade.css";

const DEFAULT_CHECKOUT = {
  wallet: "TGfxMFAXrcWQfHBFEguC428ncVzh69PrBt",
  network: "TRC-20",
};

const TIER_RANK = { start: 0, pro: 1, elite: 2 };

export const TIER_PLANS = {
  start: {
    id: "start",
    label: "PHASE START",
    price: 99,
    note: "LiqSweep strategy · M5 entries",
    features: [
      "XAUUSD trading robot access",
      "Liquidity sweep + FVG + Asian breakout",
      "Smart risk management",
    ],
    badge: null,
  },
  pro: {
    id: "pro",
    label: "PHASE PRO",
    price: 179,
    note: "Dual-direction grid · M5",
    features: [
      "Everything in START",
      "Dual grid on gold",
      "Basket take-profit management",
    ],
    badge: "Popular",
  },
  elite: {
    id: "elite",
    label: "PHASE ELITE",
    price: 249,
    note: "RSI grid · progressive lot",
    features: [
      "Everything in PRO",
      "RSI one-sided grid",
      "Priority execution profile",
    ],
    badge: "Best offer",
  },
};

function tierRank(tier) {
  return TIER_RANK[String(tier || "start").toLowerCase()] ?? 0;
}

function planPrice(tierId, priceOverrides) {
  const p = priceOverrides?.[tierId]?.price_usdt;
  return p != null ? p : TIER_PLANS[tierId]?.price ?? 0;
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
  const tier = String(currentTier || "start").toLowerCase();
  const plan = TIER_PLANS[tier] || TIER_PLANS.start;
  const isMax = tierRank(tier) >= tierRank("elite");

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
        {isMax ? "Renew plan" : "Upgrade plan"}
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
  const verifyTimers = useRef([]);
  const pollCancelRef = useRef(false);
  const confettiRef = useRef(null);

  const reset = useCallback(() => {
    verifyTimers.current.forEach(clearTimeout);
    verifyTimers.current = [];
    pollCancelRef.current = true;
    setScene("plans");
    setSelectedTier(null);
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
    if (scene === "success" && confettiRef.current) {
      fireConfetti(confettiRef.current);
    }
  }, [scene]);

  if (!open) return null;

  const curRank = tierRank(currentTier);
  const plan = selectedTier ? TIER_PLANS[selectedTier] : null;
  const checkoutPrice = selectedTier ? planPrice(selectedTier, tierPrices) : 0;

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

  function selectPlan(tierId) {
    setSelectedTier(tierId);
    setScene("checkout");
    setStep(1);
    setTxHash("");
    setHashErr(false);
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
    startVerify(h, selectedTier);
  }

  function animateRing(from, to, dur) {
    const start = performance.now();
    function frame(t) {
      const k = Math.min(1, (t - start) / dur);
      setRingPct(from + (to - from) * k);
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function setVStepState(idx, state) {
    setVSteps((prev) => {
      const next = [...prev];
      next[idx] = state;
      return next;
    });
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

    verifyTimers.current.push(
      setTimeout(() => {
        animateRing(0, 34, 1000);
        setVStepState(0, 2);
        setVStepState(1, 1);
      }, 1400),
    );
    verifyTimers.current.push(
      setTimeout(() => {
        animateRing(34, 72, 1500);
        setVStepState(1, 2);
        setVStepState(2, 1);
      }, 4200),
    );
    verifyTimers.current.push(
      setTimeout(() => {
        animateRing(72, 100, 900);
        setVStepState(2, 2);
      }, 6200),
    );

    (async () => {
      try {
        if (onEnsureAuth) await onEnsureAuth();
        await pollPayment(hash, tier);
      } catch (e) {
        finishFailed(parseApiError(e));
      }
    })();
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
    if (scene === "checkout") {
      setScene("plans");
      return;
    }
    if (scene === "verify") {
      setScene("checkout");
      return;
    }
    if (scene === "failed") {
      setScene("checkout");
      return;
    }
    onClose?.();
  }

  const ringOffset = 295 - (295 * ringPct) / 100;

  return (
    <div className="subUpgOverlay" role="dialog" aria-modal="true">
      <div className="subUpgShell">
        <div className="subUpgHdr">
          <span className="subUpgHdrTitle">
            {scene === "plans" && "Upgrade"}
            {scene === "checkout" && "Checkout"}
            {scene === "verify" && "Verification"}
            {scene === "success" && "Confirmed"}
            {scene === "failed" && "Payment"}
          </span>
          <button type="button" className="subUpgBack" onClick={back}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
        </div>

        {scene === "plans" && (
          <div className="subUpgScroll">
            <div className="subUpgAnim" style={{ margin: "8px 0 16px" }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Choose your plan</h2>
              <p style={{ color: "#9494a0", fontSize: 12.5, marginTop: 3 }}>
                Monthly subscription · pay with USDT
              </p>
            </div>
            {(["start", "pro", "elite"]).map((tid) => {
              const p = TIER_PLANS[tid];
              const price = planPrice(tid, tierPrices);
              const rank = tierRank(tid);
              const isCurrent = rank === curRank;
              const isUpgrade = rank > curRank;
              const isRenew = rank === curRank;
              return (
                <div
                  key={tid}
                  className={`subUpgPlan subUpgAnim${isCurrent ? " isCurrent" : ""}`}
                >
                  {p.badge ? (
                    <span className="subUpgPlanBadge">{p.badge}</span>
                  ) : null}
                  <div className="subUpgPlanName subUpgGoldTxt">{p.label}</div>
                  <div className="subUpgPlanPrice">
                    <b>${price}</b>
                    <span>/ month</span>
                  </div>
                  <div className="subUpgPlanNote">{p.note}</div>
                  {p.features.map((f) => (
                    <div key={f} className="subUpgFeat">
                      <span className="subUpgFeatChk">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M5 12l5 5L20 6" />
                        </svg>
                      </span>
                      {f}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="subUpgBtnGold"
                    style={{ marginTop: 12 }}
                    disabled={!isUpgrade && !isRenew}
                    onClick={() => selectPlan(tid)}
                  >
                    {isCurrent
                      ? "Renew this plan"
                      : isUpgrade
                        ? `Upgrade to ${p.label.split(" ").pop()}`
                        : "Current plan"}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {scene === "checkout" && plan && (
          <div className="subUpgScroll">
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
                className="subUpgField"
                value={txHash}
                placeholder="Paste hash after payment"
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
                ["Transaction broadcast", "Sent to TRON network"],
                ["Block confirmation", "Awaiting confirmations"],
                ["License activation", "Ready to apply key"],
              ].map(([name, meta], i) => {
                const st = vSteps[i];
                const cls =
                  st === 3 ? " fail" : st === 2 ? " ok" : st === 1 ? " on" : "";
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
                  startVerify(txHash.trim(), selectedTier);
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
