import React, { useState } from "react";

export default function LicenseAccess({ onActivate, onBuy }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function activate() {
    setErr("");
    setLoading(true);
    try {
      const res = await onActivate?.(key);
      if (res && res.ok === false) {
        setErr(res.error || "Activation failed");
      }
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="licenseRoot">
      <div className="licensePanel">
        <div className="licenseLogoStub" aria-hidden="true">
          <img src="/logo.png" alt="Phase Trade Robot" className="licenseLogoImg" />
        </div>
        <div className="licenseBrand">PHASE TRADE ROBOT</div>
        <div className="licenseSubtitle">LICENSE ACCESS</div>

        <div className="licenseRow licenseRowInput">
          <span className="licenseInputIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                d="M16 1.2a6.795 6.795 0 0 0-6.284 9.392L1.168 19.14 1 19.515V23h3.533l.429-.076L7 20.886V20h.885L10 17.886V17h.886l2.664-2.664A6.797 6.797 0 1 0 16 1.2zm0 12.6a5.76 5.76 0 0 1-2.672-.657L10.472 16H9v1.472L7.472 19H6v1.472l-1.522 1.522-.033.006H2v-2.271l.005-.011 8.918-8.919A5.798 5.798 0 1 1 16 13.8zm-4.371-.75L3.682 21H3v-.68l7.95-7.952zM17.5 4A2.5 2.5 0 1 0 20 6.5 2.5 2.5 0 0 0 17.5 4zm0 4A1.5 1.5 0 1 1 19 6.5 1.502 1.502 0 0 1 17.5 8z"
                fill="currentColor"
              />
            </svg>
          </span>
          <input
            className="licenseInput"
            value={key}
            placeholder="Enter license key..."
            onChange={(e) => setKey(e.target.value)}
          />
        </div>

        <div className="licenseRow licenseRowPrimary">
          <button
            className="licenseBtn licenseBtnPrimary"
            type="button"
            onClick={activate}
            disabled={loading}
          >
            <span className="licenseBtnLabel">
              {loading ? "..." : "ACTIVATE"}
            </span>
            <span className="licenseBtnArrow">→</span>
          </button>
        </div>

        <div className="licenseRow licenseRowSecondary">
          <button
            className="licenseBtn licenseBtnSecondary"
            type="button"
            onClick={() => onBuy?.()}
            disabled={loading}
          >
            <span className="licenseBtnIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path
                  d="M7 9V7a5 5 0 0 1 10 0v2h1.2a1.8 1.8 0 0 1 1.8 1.8l-0.7 8.2A2 2 0 0 1 17.3 21H6.7a2 2 0 0 1-2-2L4 10.8A1.8 1.8 0 0 1 5.8 9H7zm2 0h6V7a3 3 0 0 0-6 0v2z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span className="licenseBtnLabel">BUY LICENSE KEY</span>
            <span className="licenseBtnArrow">→</span>
          </button>
        </div>

        {err && <div className="licenseErr">{err}</div>}

      </div>
    </div>
  );
}

