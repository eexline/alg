import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api.js";
import {
  applyTelegramViewportCss,
  getTelegramWebApp,
  isTelegramKeyboardOpen,
} from "./telegram_init.js";
import "./subscription_upgrade.css";

const DEFAULT_CHECKOUT = {
  wallet: "",
  network: "TRC-20",
};

function applyPaymentsConfig(cfg, setCheckout, setTierPrices) {
  if (!cfg) return;
  if (cfg.wallet) {
    setCheckout({
      wallet: cfg.wallet,
      network: cfg.network || DEFAULT_CHECKOUT.network,
    });
  }
  if (cfg.tiers) setTierPrices(cfg.tiers);
}

const PURCHASE_TIER = "elite";

export const TIER_PLANS = {
  elite: {
    id: "elite",
    label: "PHASE GOLD",
    ctaLabel: "Get Phase Gold",
    price: 249,
    note: "Full automated trading, around the clock",
    features: [
      "XAUUSD trading robot access",
      "Advanced gold strategies",
      "Smart risk management",
      "Priority trade execution",
    ],
    badge: "Best offer",
  },
};

/** Screenshots in public/results/ — filename (without .jpg) = profit in USD. */
const RESULT_PROFIT_USD = [
  5387, 1837, 1514, 804, 660, 603, 581, 529, 480, 336,
];

const RESULTS = RESULT_PROFIT_USD.map((usd) => ({
  id: String(usd),
  profit: `+$${usd.toLocaleString("en-US")}`,
  img: `/results/${usd}.jpg`,
}));

function ResultsCarousel() {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(null);
  const viewportRef = useRef(null);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(RESULTS.length - 1, i + 1));
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return undefined;

    function onTouchStart(e) {
      touchStartX.current = e.touches[0].clientX;
    }

    function onTouchEnd(e) {
      if (touchStartX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (dx < -40) goNext();
      else if (dx > 40) goPrev();
      touchStartX.current = null;
    }

    vp.addEventListener("touchstart", onTouchStart, { passive: true });
    vp.addEventListener("touchend", onTouchEnd);
    return () => {
      vp.removeEventListener("touchstart", onTouchStart);
      vp.removeEventListener("touchend", onTouchEnd);
    };
  }, [goNext, goPrev]);

  return (
    <>
      <div className="subUpgCarousel">
        <button
          type="button"
          className="subUpgCarArrow subUpgCarArrowLeft"
          onClick={goPrev}
          disabled={index === 0}
          aria-label="Previous"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="subUpgCarViewport" ref={viewportRef}>
          <div
            className="subUpgCarTrack"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {RESULTS.map((item) => (
              <div className="subUpgCarSlide" key={item.id}>
                <div className="subUpgResultShot">
                  <div className="subUpgResultPill">{item.profit}</div>
                  {item.img ? (
                    <img src={item.img} alt="" className="subUpgResultImg" />
                  ) : (
                    <div className="subUpgResultPh">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M3 15l5-5 4 4 3-3 6 6" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                      </svg>
                      <span>Your result screenshot goes here</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="subUpgCarArrow subUpgCarArrowRight"
          onClick={goNext}
          disabled={index === RESULTS.length - 1}
          aria-label="Next"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <div className="subUpgCarFoot">
        <div className="subUpgCarDots" aria-hidden="true">
          {RESULTS.map((item, i) => (
            <i key={item.id} className={i === index ? "on" : ""} />
          ))}
        </div>
        <div className="subUpgCarCount">
          {index + 1} / {RESULTS.length}
        </div>
      </div>
    </>
  );
}

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

function formatActiveUntil(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
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
    <div className="refCard refCardGold">
      <div className="refCard-h">
        <span className="refCard-t">Subscription</span>
        {hasActiveAccess ? (
          <span className="badge-status live">
            <span className="dot" />
            Active
          </span>
        ) : (
          <span className="badge-status">
            <span className="dot" />
            Inactive
          </span>
        )}
      </div>
      <div className="refTr">
        <span className="refTr-k">Plan</span>
        <span className="refTr-v refGoldTxt">{tierLabel || plan.label}</span>
      </div>
      <div className="refTr">
        <span className="refTr-k">Price</span>
        <span className="refTr-v">${plan.price} / month</span>
      </div>
      <div className="refTr">
        <span className="refTr-k">Valid until</span>
        <span className="refTr-v">{formatExpiry(accessExpiresAt)}</span>
      </div>
      <button type="button" className="refBtn refBtnGold" onClick={onUpgrade}>
        Renew plan
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

const SCENE_TRANSITION_MS = 420;

export default function SubscriptionUpgradeFlow({
  open,
  onClose,
  currentTier,
  onRedeemCode,
  onEnsureAuth,
  onPaymentComplete,
  presentation = "overlay",
}) {
  const [scene, setScene] = useState("plans");
  const [present, setPresent] = useState(false);
  const [scenePhase, setScenePhase] = useState("hidden");
  const [selectedTier, setSelectedTier] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [hashErr, setHashErr] = useState(false);
  const [copyAmountOk, setCopyAmountOk] = useState(false);
  const [copyAddrOk, setCopyAddrOk] = useState(false);
  const [step, setStep] = useState(1);
  const [ringPct, setRingPct] = useState(0);
  const [ringFail, setRingFail] = useState(false);
  const [vSteps, setVSteps] = useState([0, 0, 0]);
  const [licenseKey, setLicenseKey] = useState("");
  const [accessExpiresAt, setAccessExpiresAt] = useState("");
  const [copyKeyOk, setCopyKeyOk] = useState(false);
  const [activateErr, setActivateErr] = useState("");
  const [activating, setActivating] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [checkout, setCheckout] = useState(DEFAULT_CHECKOUT);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
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
    setScene("plans");
    setSelectedTier(PURCHASE_TIER);
    setTxHash("");
    setHashErr(false);
    setCopyAmountOk(false);
    setCopyAddrOk(false);
    setStep(1);
    setRingPct(0);
    setRingFail(false);
    setVSteps([0, 0, 0]);
    setLicenseKey("");
    setAccessExpiresAt("");
    setCopyKeyOk(false);
    setActivateErr("");
    setActivating(false);
    setPaymentDone(false);
    setFailReason("");
    setCheckout(DEFAULT_CHECKOUT);
  }, []);

  const loadCheckoutConfig = useCallback(async () => {
    setCheckoutLoading(true);
    try {
      const cfg = await api.paymentsConfig();
      applyPaymentsConfig(cfg, setCheckout, setTierPrices);
    } catch (e) {
      console.warn("payments/config failed", e);
    } finally {
      setCheckoutLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    pollCancelRef.current = false;
    setSelectedTier(PURCHASE_TIER);
    setScene("plans");
    loadCheckoutConfig();
    return undefined;
  }, [open, loadCheckoutConfig]);

  useEffect(() => {
    if (!open || scene !== "checkout") return undefined;
    loadCheckoutConfig();
    return undefined;
  }, [open, scene, loadCheckoutConfig]);

  useEffect(() => {
    if (open) setPresent(true);
  }, [open]);

  useEffect(() => {
    if (!present || !open) return undefined;
    setScenePhase("entering");
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => setScenePhase("active"));
    });
    return () => {
      cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [present, open]);

  useEffect(() => {
    if (open || !present) return undefined;
    setScenePhase("exiting");
    const timer = setTimeout(() => {
      setPresent(false);
      setScenePhase("hidden");
    }, SCENE_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [open, present]);

  useEffect(() => {
    if (!present) reset();
  }, [present, reset]);

  useEffect(() => {
    if (!present) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [present]);

  useEffect(() => {
    if (!present) {
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
  }, [present]);

  useEffect(() => {
    if (scene === "success" && confettiRef.current) {
      fireConfetti(confettiRef.current);
    }
  }, [scene]);

  if (!present) return null;

  const plan = TIER_PLANS[PURCHASE_TIER];
  const checkoutPrice = planPrice(PURCHASE_TIER, tierPrices);

  function markStep(n) {
    setStep(n);
  }

  function markAllStepsDone() {
    setStep(4);
  }

  function copyAmount() {
    navigator.clipboard?.writeText(String(checkoutPrice)).catch(() => {});
    setCopyAmountOk(true);
    markStep(1);
    setTimeout(() => setCopyAmountOk(false), 2000);
  }

  function copyWallet() {
    navigator.clipboard?.writeText(checkout.wallet).catch(() => {});
    setCopyAddrOk(true);
    markStep(2);
    setTimeout(() => setCopyAddrOk(false), 2000);
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
    setAccessExpiresAt(res?.expires_at || "");
    setScene("success");
  }

  function copyLicenseKey() {
    const key = licenseKey.trim();
    if (!key) return;
    navigator.clipboard?.writeText(key).catch(() => {});
    setCopyKeyOk(true);
    setTimeout(() => setCopyKeyOk(false), 2000);
  }

  async function openTradingRobot() {
    try {
      await api.paymentOpenRobot();
    } catch {
      /* still open dashboard if sync fails */
    }
    onClose?.();
    await onPaymentComplete?.();
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
    if (scene === "checkout" || scene === "results") {
      setScene("plans");
      return;
    }
    if (scene === "success") {
      onClose?.();
      return;
    }
    closeFlow();
  }

  const overlay = (
    <div
      className={[
        "subUpgOverlay",
        presentation === "scene" && "subUpgOverlayScene",
        scenePhase === "active" && "isActive",
        scenePhase === "exiting" && "isExitLeft",
        keyboardOpen && "subUpgKeyboardOpen",
      ]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-modal="true"
    >
      <div className="subUpgShell">
        <div className={`subUpgHdr${scene === "plans" || scene === "results" ? " subUpgHdrPlans" : ""}`}>
          {scene === "plans" || scene === "results" ? (
            scene === "results" ? (
              <div className="subUpgHdrLeft">
                <div className="subUpgHdrLogo" aria-hidden="true">
                  <img src="/logo.png" alt="" className="subUpgHdrLogoImg" />
                </div>
                <span className="subUpgHdrName">Results</span>
              </div>
            ) : (
              <div className="subUpgHdrLogo" aria-hidden="true">
                <img src="/logo.png" alt="" className="subUpgHdrLogoImg" />
              </div>
            )
          ) : (
            <span className="subUpgHdrTitle">
              {scene === "checkout" && "Checkout"}
              {scene === "verify" && "Verification"}
              {scene === "success" && "Confirmed"}
              {scene === "failed" && "Payment"}
            </span>
          )}
          <button type="button" className="subUpgBack" onClick={back}>
            {scene === "verify" ? (
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

        {scene === "plans" && plan && (
          <div className="subUpgScroll">
            <div className="subUpgPlansHead subUpgAnim">
              <h2 className="subUpgPlansTitle">Choose your plan</h2>
              <p className="subUpgPlansSub">Monthly subscription</p>
            </div>
            <div className="subUpgPlan subUpgAnim">
              {plan.badge ? (
                <span className="subUpgPlanBadge">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2l2.6 6.3L21 9l-5 4.5L17.5 21 12 17.3 6.5 21 8 13.5 3 9l6.4-.7z" />
                  </svg>
                  {plan.badge}
                </span>
              ) : null}
              <div className="subUpgPlanName subUpgGoldTxt">{plan.label}</div>
              <div className="subUpgPlanPrice">
                <b>${checkoutPrice}</b>
                <span>/ month</span>
              </div>
              <div className="subUpgPlanNote">{plan.note}</div>
              <div className="subUpgPlanFeats">
                {plan.features.map((feat) => (
                  <div className="subUpgFeat" key={feat}>
                    <span className="subUpgFeatChk" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 12l5 5L20 6" />
                      </svg>
                    </span>
                    {feat}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="subUpgBtnGold subUpgPlanCta"
                onClick={() => setScene("checkout")}
              >
                {plan.ctaLabel}
                <svg
                  className="subUpgPlanCtaArrow"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
              <button
                type="button"
                className="subUpgBtnPlanGhost"
                onClick={() => setScene("results")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 3v18h18" />
                  <path d="M7 14l4-4 3 3 5-6" />
                </svg>
                View results
              </button>
              <div className="subUpgSocial">
                <div className="subUpgAvatars" aria-hidden="true">
                  <span>A</span>
                  <span>M</span>
                  <span>D</span>
                  <span>+</span>
                </div>
                <div className="subUpgSocialTxt">
                  <b>47 traders</b> joined today
                </div>
              </div>
            </div>
          </div>
        )}

        {scene === "results" && (
          <div className="subUpgResultsWrap">
            <ResultsCarousel />
          </div>
        )}

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

            <div className={`subUpgPayBlock subUpgAnim${copyAmountOk ? " copied" : ""}`}>
              <div className="subUpgPayTop">
                <span className="subUpgPayLbl">Amount to pay</span>
                <span className="subUpgPayNet">USDT · {checkout.network}</span>
              </div>
              <div className="subUpgPayValue">{checkoutPrice} USDT</div>
              <div className="subUpgPlanNote" style={{ marginTop: 8 }}>
                {plan.label}
              </div>
              <button
                type="button"
                className={`subUpgCopy${copyAmountOk ? " ok" : ""}`}
                onClick={copyAmount}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {copyAmountOk ? "Copied" : "Copy amount"}
              </button>
            </div>

            <div className={`subUpgPayBlock subUpgAnim${copyAddrOk ? " copied" : ""}`}>
              <div className="subUpgPayLbl">Wallet address</div>
              <div className="subUpgPayValue">
                {checkoutLoading && !checkout.wallet
                  ? "Loading wallet…"
                  : checkout.wallet || "Wallet not configured"}
              </div>
              <button
                type="button"
                className={`subUpgCopy${copyAddrOk ? " ok" : ""}`}
                onClick={copyWallet}
                disabled={!checkout.wallet || checkoutLoading}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {copyAddrOk ? "Copied" : "Copy address"}
              </button>
            </div>

            <div className="subUpgHint subUpgAnim">
              <span className="subUpgHintIco" aria-hidden="true">
                !
              </span>
              <p>
                Send <b>${checkoutPrice} USDT</b> on the <b>{checkout.network} network</b>. Then
                paste the transaction hash below to verify.
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
              <svg width="120" height="120" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="subUpgGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#F6DD93" />
                    <stop offset="50%" stopColor="#E3C168" />
                    <stop offset="100%" stopColor="#BE9638" />
                  </linearGradient>
                </defs>
                <circle
                  className="subUpgRingTrack"
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                <circle
                  className={`subUpgRingFg${ringFail ? " fail" : ""}`}
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke={ringFail ? "#FF453A" : "url(#subUpgGrad)"}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray="314"
                  strokeDashoffset={314 - (314 * ringPct) / 100}
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
                {
                  name: "Transaction broadcast",
                  defaultMeta: "Sent to TRON network",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
                    </svg>
                  ),
                },
                {
                  name: "Block confirmation",
                  defaultMeta: "Awaiting confirmations",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <path d="M9 9h6v6H9z" />
                    </svg>
                  ),
                },
                {
                  name: "License activation",
                  defaultMeta: "Linking to your account",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  ),
                },
              ].map((step, i) => {
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
                      : step.defaultMeta;
                return (
                  <div key={step.name} className={`subUpgVStep${cls}`}>
                    <div className="subUpgVStepIco">{step.icon}</div>
                    <div className="subUpgVStepTxt">
                      <div className="subUpgVStepName">{step.name}</div>
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
              <div className="subUpgPlanName subUpgGoldTxt subUpgSPlanName">
                {plan.label}
              </div>
              <div className="subUpgSPlanUntil">
                Active until {formatActiveUntil(accessExpiresAt)}
              </div>
            </div>
            {licenseKey ? (
              <div className="subUpgSKey">
                <div className="subUpgSKeyLbl">Your access key</div>
                <div className="subUpgSKeyVal">{licenseKey}</div>
                <button
                  type="button"
                  className={`subUpgCopy subUpgSKeyCopyBtn${copyKeyOk ? " ok" : ""}`}
                  onClick={copyLicenseKey}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  {copyKeyOk ? "Copied" : "Copy access key"}
                </button>
              </div>
            ) : null}
            {paymentDone ? (
              <button
                type="button"
                className="subUpgBtnGold subUpgOpenRobotBtn"
                style={{ maxWidth: 290, zIndex: 2 }}
                onClick={openTradingRobot}
              >
                Open trading robot
                <span aria-hidden="true">→</span>
              </button>
            ) : (
              <>
                {activateErr ? (
                  <div className="subUpgActivateErr">{activateErr}</div>
                ) : null}
                <button
                  type="button"
                  className="subUpgBtnGold"
                  style={{ maxWidth: 290, zIndex: 2 }}
                  disabled={activating}
                  onClick={activateKey}
                >
                  {activating ? "Activating…" : "Activate upgrade"}
                </button>
              </>
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

  if (presentation === "scene") return overlay;
  return createPortal(overlay, document.body);
}
