// ============================================================
// Paymob integration service
// ============================================================
// One module owns every call to Paymob. The rest of the codebase imports
// these functions instead of talking to Paymob directly. That way, if Paymob
// renames an endpoint or we ever need to swap to Kashier as a fallback, we
// touch this single file.
//
// Three public functions:
//   1) createPaymentIntention(...)  → starts a pay-in (customer → platform).
//   2) verifyHmac(...)              → validates an inbound Paymob webhook.
//   3) createPayout(...)            → sends money out to a worker.
//
// Mode: sandbox. The base URL and keys are pulled from .env, so flipping to
// production is a config change, not a code change.
// ============================================================

const crypto = require("crypto");

const BASE_URL = process.env.PAYMOB_BASE_URL || "https://accept.paymob.com/v1";
const SECRET_KEY = process.env.PAYMOB_SECRET_KEY || "";
const PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY || "";
const HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET || "";

// Build the array of integration ids we'll send to Paymob. We include only
// the methods whose ids are actually configured — so a missing wallet or
// InstaPay id silently falls off the unified checkout instead of crashing.
const collectIntegrationIds = () => {
  const ids = [];
  if (process.env.PAYMOB_INTEGRATION_CARD) ids.push(Number(process.env.PAYMOB_INTEGRATION_CARD));
  if (process.env.PAYMOB_INTEGRATION_WALLET) ids.push(Number(process.env.PAYMOB_INTEGRATION_WALLET));
  if (process.env.PAYMOB_INTEGRATION_INSTAPAY) ids.push(Number(process.env.PAYMOB_INTEGRATION_INSTAPAY));
  // Filter NaNs in case someone put a non-numeric value in .env.
  return ids.filter((id) => Number.isFinite(id));
};

// ============================================================
// createPaymentIntention
// ============================================================
// Calls Paymob's Intention API and returns the URL the customer should be
// redirected to. The Unified Checkout page hosted by Paymob handles the
// actual card/wallet/InstaPay UI — we don't render any of it ourselves.
//
// Inputs:
//   amount        — EGP, in whole pounds (the function converts to piasters)
//   customer      — { firstName, lastName, email, phone }
//   billingData   — optional address info; Paymob is strict about required
//                   billing fields, so we fill them with safe defaults if
//                   the caller doesn't provide them.
//   extras        — passed back to us via the webhook in `special_reference`
//                   and `metadata`, so we can reconcile the response to the
//                   right Payment doc.
// ============================================================
const createPaymentIntention = async ({ amount, customer, billingData = {}, extras = {} }) => {
  if (!SECRET_KEY) {
    throw new Error("PAYMOB_SECRET_KEY is not set");
  }

  const integrationIds = collectIntegrationIds();
  if (integrationIds.length === 0) {
    throw new Error("No PAYMOB_INTEGRATION_* ids configured");
  }

  // Paymob expects the amount in piasters (1 EGP = 100 piasters). Multiplying
  // last avoids floating-point dust on prices like 99.99.
  const amountCents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Invalid amount");
  }

  const payload = {
    amount: amountCents,
    currency: "EGP",
    payment_methods: integrationIds,
    // `special_reference` is echoed back on the webhook. Putting our internal
    // Payment id here lets the webhook handler look up the right doc with
    // a single DB query — no need to parse Paymob's order id.
    special_reference: String(extras.paymentId || ""),
    // Metadata is also echoed back and shows up in the Paymob dashboard,
    // which makes support investigations easier.
    extras: {
      payment_id: String(extras.paymentId || ""),
      order_id: String(extras.orderId || ""),
    },
    items: [
      {
        name: extras.itemName || "Service order",
        amount: amountCents,
        description: extras.itemDescription || "Service request payment",
        quantity: 1,
      },
    ],
    billing_data: {
      // Paymob rejects the request if any of these strings is empty.
      // Filling missing values with "NA" matches Paymob's own docs.
      apartment: billingData.apartment || "NA",
      first_name: customer.firstName || "Customer",
      last_name: customer.lastName || "User",
      street: billingData.street || "NA",
      building: billingData.building || "NA",
      phone_number: customer.phone || "+201000000000",
      country: "EG",
      email: customer.email || "no-reply@example.com",
      floor: billingData.floor || "NA",
      state: billingData.state || "NA",
    },
    customer: {
      first_name: customer.firstName || "Customer",
      last_name: customer.lastName || "User",
      email: customer.email || "no-reply@example.com",
    },
    // Where Paymob sends the customer after the hosted checkout completes.
    // Our /checkout/result page reads ?paymentId=... from the URL and polls
    // the backend for the latest status (the webhook is authoritative).
    redirection_url: `${process.env.FRONTEND_BASE_URL || "http://localhost:3000"}/checkout/result?paymentId=${extras.paymentId || ""}`,
    // Server-to-server webhook URL. Paymob calls this when the transaction
    // resolves (success or fail). The HMAC signature lets us trust the body.
    notification_url: `${process.env.PAYMOB_WEBHOOK_BASE || `http://localhost:${process.env.PORT || 5000}`}/api/payments/webhook`,
  };

  const res = await fetch(`${BASE_URL}/intention/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Paymob's v1 unified API uses a bearer-style header with the secret key.
      Authorization: `Token ${SECRET_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  // Read raw text first so we can surface meaningful errors even when Paymob
  // returns HTML (it does this for auth failures).
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }

  if (!res.ok) {
    const msg = body?.detail || body?.message || body?.raw || `Paymob ${res.status}`;
    const err = new Error(`Paymob Intention failed: ${msg}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  // The Intention response includes a `client_secret` we hand to the hosted
  // checkout via the URL fragment. The hosted checkout itself lives at
  // /unifiedcheckout/ on the public Paymob domain.
  const clientSecret = body.client_secret;
  if (!clientSecret) {
    throw new Error("Paymob Intention response missing client_secret");
  }

  const checkoutUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${encodeURIComponent(PUBLIC_KEY)}&clientSecret=${encodeURIComponent(clientSecret)}`;

  return {
    clientSecret,
    checkoutUrl,
    paymobOrderId: body.id || body.order_id || null,
    paymobIntentionId: body.id || null,
  };
};

// ============================================================
// verifyHmac
// ============================================================
// Paymob signs every webhook with HMAC-SHA512 over a documented list of
// fields concatenated as plain strings (no separator). Without this check
// any attacker who guesses our webhook URL could mark payments completed.
//
// Paymob's documented field order for the *transaction processed* callback
// (the one our pay-in webhook receives):
//   amount_cents, created_at, currency, error_occured, has_parent_transaction,
//   id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded,
//   is_standalone_payment, is_voided, order.id, owner, pending,
//   source_data.pan, source_data.sub_type, source_data.type, success.
// The fields come from `obj` inside the webhook payload.
// ============================================================
const verifyHmac = (obj, receivedHmac) => {
  if (!HMAC_SECRET || !receivedHmac) return false;

  const concat =
    String(obj.amount_cents ?? "") +
    String(obj.created_at ?? "") +
    String(obj.currency ?? "") +
    String(obj.error_occured ?? "") +
    String(obj.has_parent_transaction ?? "") +
    String(obj.id ?? "") +
    String(obj.integration_id ?? "") +
    String(obj.is_3d_secure ?? "") +
    String(obj.is_auth ?? "") +
    String(obj.is_capture ?? "") +
    String(obj.is_refunded ?? "") +
    String(obj.is_standalone_payment ?? "") +
    String(obj.is_voided ?? "") +
    String(obj.order?.id ?? "") +
    String(obj.owner ?? "") +
    String(obj.pending ?? "") +
    String(obj.source_data?.pan ?? "") +
    String(obj.source_data?.sub_type ?? "") +
    String(obj.source_data?.type ?? "") +
    String(obj.success ?? "");

  const computed = crypto
    .createHmac("sha512", HMAC_SECRET)
    .update(concat)
    .digest("hex");

  // timingSafeEqual prevents leaking signature info through response-time
  // measurements. Lengths must match before the constant-time compare.
  try {
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(String(receivedHmac), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

// ============================================================
// createPayout
// ============================================================
// Sends money out of the platform account to a worker's bank / InstaPay /
// wallet destination. This uses Paymob's Payouts product, which is a
// separate add-on from Accept (pay-in). On a brand-new sandbox account the
// Payouts endpoint may reject calls until the product is enabled — that
// surfaces as a thrown error, which the controller catches and refunds the
// reserved balance.
//
// Auth key: PAYMOB_PAYOUT_API_KEY when set, else falls back to the regular
// secret key (newer unified dashboards expose Payouts under the same key).
// ============================================================
const createPayout = async ({ amount, method, destination, reference }) => {
  // Mock mode — useful when Paymob Payouts isn't activated on the account
  // (default for sandbox). Simulates a successful disbursement so the full
  // worker withdrawal UX can be demoed without applying for the Payouts
  // product. Flip PAYMOB_PAYOUT_MOCK off (or unset) to call the real API.
  if (String(process.env.PAYMOB_PAYOUT_MOCK || "").toLowerCase() === "true") {
    console.log(`[paymob mock] payout ${amount} EGP via ${method} → ${JSON.stringify(destination)}`);
    return {
      paymobPayoutId: `MOCK-${Date.now()}-${reference || "x"}`,
      status: "completed",
      raw: { mock: true },
    };
  }

  const apiKey = process.env.PAYMOB_PAYOUT_API_KEY || SECRET_KEY;
  if (!apiKey) {
    throw new Error("No Paymob API key available for payout");
  }

  const amountCents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Invalid payout amount");
  }

  // Paymob's payout payload varies slightly by destination type. We send the
  // method-specific shape Paymob expects.
  const payload = {
    amount_cents: amountCents,
    currency: "EGP",
    // Our internal reference (the WalletTransaction id) — echoed back on the
    // payout webhook so we can flip the right doc to completed/failed.
    external_reference: String(reference || ""),
  };

  if (method === "bank") {
    payload.payout_method = "bank_transfer";
    payload.bank_transfer = {
      account_number: destination.bankAccountNumber || "",
      bank_name: destination.bankName || "",
      account_holder_name: destination.accountHolderName || "",
    };
  } else if (method === "instapay") {
    payload.payout_method = "instapay";
    payload.instapay = {
      alias: destination.instapayAlias || "",
    };
  } else if (method === "wallet") {
    payload.payout_method = "mobile_wallet";
    payload.mobile_wallet = {
      msisdn: destination.walletPhone || "",
    };
  } else {
    throw new Error(`Unknown payout method: ${method}`);
  }

  const res = await fetch(`${BASE_URL}/payouts/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }

  if (!res.ok) {
    const msg = body?.detail || body?.message || body?.raw || `Paymob ${res.status}`;
    const err = new Error(`Paymob Payout failed: ${msg}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return {
    paymobPayoutId: body.id || body.payout_id || null,
    status: body.status || "pending",
    raw: body,
  };
};

module.exports = {
  createPaymentIntention,
  verifyHmac,
  createPayout,
};
