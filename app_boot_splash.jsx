import React from "react";

/** Initial boot screen (logo float + brand + progress), shown while auth is checked. */
export default function AppBootSplash() {
  return (
    <div className="appBootSplash" aria-hidden="true">
      <div className="appBootInner">
        <img src="/logo.png" alt="" className="appBootLogo" />
        <div className="appBootName">PHASE TRADE ROBOT</div>
      </div>
    </div>
  );
}
