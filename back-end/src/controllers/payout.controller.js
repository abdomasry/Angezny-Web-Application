// ============================================================
// Payout Controller
// ============================================================
// Worker-side withdrawal flow:
//   POST /api/worker/payouts/info       — set/update payout destination
//   POST /api/worker/payouts/withdraw   — request a withdrawal
//   POST /api/worker/payouts/webhook    — Paymob payout result callback
//   GET  /api/worker/payouts/withdrawals — list past withdrawals
// ============================================================

const WorkerProfile = require("../models/Worker.Profile");
const WalletTransaction = require("../models/Wallet.Transaction");
const paymob = require("../services/paymob.service");

// ============================================================
// POST /api/worker/payouts/info
// ============================================================
// Body: { method, bankAccountNumber?, bankName?, accountHolderName?,
//         instapayAlias?, walletPhone? }
//
// The worker picks one method and fills the matching block. We validate
// here so the destination is always usable when a withdrawal kicks off.
// ============================================================
const setPayoutInfo = async (req, res) => {
  try {
    const {
      method,
      bankAccountNumber,
      bankName,
      accountHolderName,
      instapayAlias,
      walletPhone,
    } = req.body || {};

    if (!["bank", "instapay", "wallet"].includes(method)) {
      return res.status(400).json({ message: "طريقة السحب غير صالحة" });
    }

    // Per-method validation. We don't try to validate format too aggressively
    // — Paymob will reject malformed values at withdrawal time, and an
    // overly strict regex here would just block legitimate edge cases.
    if (method === "bank") {
      if (!String(bankAccountNumber || "").trim()) {
        return res.status(400).json({ message: "رقم الحساب البنكي مطلوب" });
      }
      if (!String(accountHolderName || "").trim()) {
        return res.status(400).json({ message: "اسم صاحب الحساب مطلوب" });
      }
    } else if (method === "instapay") {
      if (!String(instapayAlias || "").trim()) {
        return res.status(400).json({ message: "اسم InstaPay مطلوب" });
      }
    } else if (method === "wallet") {
      if (!/^01\d{9}$/.test(String(walletPhone || "").trim())) {
        return res.status(400).json({ message: "رقم المحفظة غير صالح" });
      }
    }

    const profile = await WorkerProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: "ملف العامل غير موجود" });
    }

    profile.payoutInfo = {
      method,
      bankAccountNumber: String(bankAccountNumber || "").trim(),
      bankName: String(bankName || "").trim(),
      accountHolderName: String(accountHolderName || "").trim(),
      instapayAlias: String(instapayAlias || "").trim(),
      walletPhone: String(walletPhone || "").trim(),
      updatedAt: new Date(),
    };
    await profile.save();

    res.json({ payoutInfo: profile.payoutInfo });
  } catch (err) {
    console.error("setPayoutInfo error:", err);
    res.status(500).json({ message: "خطأ في حفظ بيانات السحب" });
  }
};

// ============================================================
// GET /api/worker/payouts/info
// ============================================================
// Read the saved payout destination (so the form can prefill).
// ============================================================
const getPayoutInfo = async (req, res) => {
  try {
    const profile = await WorkerProfile.findOne({ userId: req.user._id })
      .select("payoutInfo");
    res.json({ payoutInfo: profile?.payoutInfo || null });
  } catch (err) {
    console.error("getPayoutInfo error:", err);
    res.status(500).json({ message: "خطأ في تحميل بيانات السحب" });
  }
};

// ============================================================
// POST /api/worker/payouts/withdraw
// ============================================================
// Body: { amount }
//
// Atomic balance reservation: we use a conditional findOneAndUpdate that
// decrements `walletBalance` only if it's >= amount. This prevents a
// double-click from issuing two withdrawals that exceed the balance.
//
// If the Paymob call fails synchronously, we revert the reservation and
// mark the transaction failed in the same response. If Paymob accepts the
// request, we leave it pending and wait for the payout webhook to flip it.
// ============================================================
const requestWithdrawal = async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "المبلغ غير صالح" });
    }

    const profile = await WorkerProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: "ملف العامل غير موجود" });
    }
    if (!profile.payoutInfo?.method) {
      return res.status(400).json({
        message: "يرجى ضبط بيانات السحب أولاً",
      });
    }

    // Atomic reservation. The `walletBalance: { $gte: amount }` filter is the
    // safety net — without it, two concurrent requests could both pass a
    // separate read-then-write and overdraw the wallet.
    const reserved = await WorkerProfile.findOneAndUpdate(
      { userId: req.user._id, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount } },
      { new: true },
    );
    if (!reserved) {
      return res.status(400).json({ message: "الرصيد غير كافٍ" });
    }

    // Create the pending transaction so the worker can see it immediately,
    // even before Paymob responds. If the Paymob call throws below, we mark
    // this same doc as failed and bump the balance back up.
    const txn = await WalletTransaction.create({
      workerId: req.user._id,
      type: "debit",
      amount,
      source: "withdrawal",
      status: "pending",
      payoutMethod: profile.payoutInfo.method,
      note: `طلب سحب — ${profile.payoutInfo.method}`,
    });

    try {
      const { paymobPayoutId, status } = await paymob.createPayout({
        amount,
        method: profile.payoutInfo.method,
        destination: profile.payoutInfo,
        reference: String(txn._id),
      });
      txn.paymobPayoutId = paymobPayoutId;
      // If Paymob responded with a terminal status synchronously, reflect it.
      // Most of the time it's pending and we wait for the webhook.
      if (status === "completed" || status === "success") {
        txn.status = "completed";
        // lifetimeWithdrawn is incremented on confirmed success only.
        await WorkerProfile.findOneAndUpdate(
          { userId: req.user._id },
          { $inc: { lifetimeWithdrawn: amount } },
        );
      } else if (status === "failed" || status === "rejected") {
        txn.status = "failed";
        txn.failureReason = "Paymob rejected payout";
        await WorkerProfile.findOneAndUpdate(
          { userId: req.user._id },
          { $inc: { walletBalance: amount } },
        );
      }
      await txn.save();
    } catch (paymobErr) {
      // Refund the reservation so the worker doesn't lose money to an API
      // outage. The transaction stays in the DB as a failed record.
      console.error("paymob payout error:", paymobErr);
      txn.status = "failed";
      txn.failureReason = paymobErr.message || "Payout API error";
      await txn.save();
      await WorkerProfile.findOneAndUpdate(
        { userId: req.user._id },
        { $inc: { walletBalance: amount } },
      );
      return res.status(502).json({
        message: paymobErr.message || "تعذّر إرسال طلب السحب",
        transactionId: String(txn._id),
      });
    }

    res.json({
      transaction: txn,
      walletBalance: reserved.walletBalance,
    });
  } catch (err) {
    console.error("requestWithdrawal error:", err);
    res.status(500).json({ message: "خطأ في إنشاء طلب السحب" });
  }
};

// ============================================================
// POST /api/worker/payouts/webhook
// ============================================================
// Paymob payout result callback. We accept the call without auth (Paymob
// doesn't send our JWT), then verify the HMAC signature on the way in.
//
// For sandbox accounts that haven't been onboarded to Payouts at all, this
// route will simply never receive a callback — and the withdrawal stays
// pending until an admin reconciles it manually.
// ============================================================
const handlePayoutWebhook = async (req, res) => {
  try {
    const receivedHmac = req.query?.hmac || req.body?.hmac;
    const obj = req.body?.obj || req.body;
    if (!obj) return res.status(400).json({ message: "Missing obj" });

    if (!paymob.verifyHmac(obj, receivedHmac)) {
      console.warn("paymob payout webhook: HMAC verification failed");
      return res.status(401).json({ message: "Invalid signature" });
    }

    const ref = obj.external_reference || obj.reference;
    const txn = ref ? await WalletTransaction.findById(ref) : null;
    if (!txn) {
      // Acknowledge — replying 4xx makes Paymob retry indefinitely.
      console.warn("paymob payout webhook: no matching transaction for", ref);
      return res.json({ ok: true });
    }

    // Idempotency: skip if the doc is already terminal.
    if (txn.status === "completed" || txn.status === "failed") {
      return res.json({ ok: true });
    }

    const success = obj.success === true && obj.error_occured === false;
    if (success) {
      txn.status = "completed";
      txn.paymobPayoutId = String(obj.id || txn.paymobPayoutId || "");
      await txn.save();
      // Bump lifetimeWithdrawn now that the money has actually left the
      // platform. We don't touch walletBalance again — it was already
      // decremented at reservation time.
      await WorkerProfile.findOneAndUpdate(
        { userId: txn.workerId },
        { $inc: { lifetimeWithdrawn: txn.amount } },
      );
    } else {
      txn.status = "failed";
      txn.failureReason = obj.data?.message || obj.error || "Payout failed at gateway";
      await txn.save();
      // Money never moved — give the balance back.
      await WorkerProfile.findOneAndUpdate(
        { userId: txn.workerId },
        { $inc: { walletBalance: txn.amount } },
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("paymob payout webhook error:", err);
    res.json({ ok: true });
  }
};

// ============================================================
// GET /api/worker/payouts/withdrawals
// ============================================================
// History of withdrawal-source transactions only. Order-completion credits
// are still visible on the existing /api/worker/wallet endpoint.
// ============================================================
const listWithdrawals = async (req, res) => {
  try {
    const transactions = await WalletTransaction.find({
      workerId: req.user._id,
      source: "withdrawal",
    })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ transactions });
  } catch (err) {
    console.error("listWithdrawals error:", err);
    res.status(500).json({ message: "خطأ في تحميل سجل السحوبات" });
  }
};

module.exports = {
  setPayoutInfo,
  getPayoutInfo,
  requestWithdrawal,
  handlePayoutWebhook,
  listWithdrawals,
};
