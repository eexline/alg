const base = "";

async function request(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = localStorage.getItem("access_token");
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(`${base}${path}`, { ...opts, headers });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) {
    let detail = text;
    if (typeof data === "object" && data?.detail != null) {
      detail =
        typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail);
    }
    const err = new Error(detail);
    err.status = r.status;
    throw err;
  }
  return data;
}

export const api = {
  licensePurchaseUrl: () => request("/api/webapp/license-purchase-url"),
  loginTelegram: (initData) =>
    request("/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ init_data: initData }),
    }),
  me: () => request("/api/users/me"),
  redeemCode: (code) =>
    request("/api/tokens/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  verifyPayment: (txHash, tier) =>
    request("/api/payments/verify", {
      method: "POST",
      body: JSON.stringify({ tx_hash: txHash, tier }),
    }),
  paymentOpenRobot: () =>
    request("/api/payments/open-robot", { method: "POST" }),
  paymentsConfig: () => request("/api/payments/config"),
  listBrokers: () => request("/api/brokers/accounts"),
  mt5ServersCatalog: () => request("/api/brokers/catalog/servers"),
  addBroker: (body) =>
    request("/api/brokers/accounts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  addBrokerAsync: (body) =>
    request("/api/brokers/accounts/async", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  brokerAuthJob: (jobId) => request(`/api/brokers/accounts/async/${jobId}`),
  startTrading: (accountId) =>
    request("/api/trading/start", {
      method: "POST",
      body: JSON.stringify({
        account_id: accountId,
      }),
    }),
  stopTrading: (sessionId) =>
    request(`/api/trading/sessions/${sessionId}/stop`, { method: "POST" }),
  sessions: () => request("/api/trading/sessions"),
};
