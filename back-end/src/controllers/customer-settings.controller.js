const PaymentMethod = require("../models/PaymentMethod");
const User = require("../models/User.Model");

// ============================================================
// GET /api/customer/payment-methods
// ============================================================
// Fetches all saved payment methods for the logged-in user.
// ============================================================
const getPaymentMethods = async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find({
      userId: req.user._id,
    }).sort({ isDefault: -1, createdAt: -1 });

    res.json({ paymentMethods });
  } catch (error) {
    console.error("getPaymentMethods error:", error);
    res.status(500).json({ message: "Server error fetching payment methods" });
  }
};

// ============================================================
// POST /api/customer/payment-methods
// ============================================================
// Adds a new saved payment method.
// ============================================================
const addPaymentMethod = async (req, res) => {
  try {
    const { cardholderName, lastFourDigits, cardBrand, expiryMonth, expiryYear } = req.body;

    // --- Validation ---
    // We check required fields manually here for clear error messages.
    // The Mongoose schema also validates, but those errors are less readable.
    if (!cardholderName || !lastFourDigits || !cardBrand || !expiryMonth || !expiryYear) {
      return res.status(400).json({
        message: "All fields are required: cardholderName, lastFourDigits, cardBrand, expiryMonth, expiryYear",
      });
    }

    // Count existing cards to decide if this should be default.
    // countDocuments is fast — it doesn't load any documents into memory,
    // it just asks MongoDB "how many match this filter?".
    const existingCount = await PaymentMethod.countDocuments({
      userId: req.user._id,
    });

    // If this is the first card (existingCount === 0), make it default.
    const isDefault = existingCount === 0;

    // Create the payment method document in MongoDB.
    // Mongoose will run all schema validations (regex for lastFourDigits,
    // enum for cardBrand, min/max for expiryMonth, etc.).
    const paymentMethod = await PaymentMethod.create({
      userId: req.user._id,
      cardholderName,
      lastFourDigits,
      cardBrand,
      expiryMonth,
      expiryYear,
      isDefault,
    });

    res.status(201).json({ paymentMethod });
  } catch (error) {
    console.error("addPaymentMethod error:", error);
    res.status(500).json({ message: "Server error adding payment method" });
  }
};

// ============================================================
// DELETE /api/customer/payment-methods/:id
// ============================================================
// Deletes a saved payment method by its ID.
// ============================================================
const deletePaymentMethod = async (req, res) => {
  try {
    // findOneAndDelete finds ONE document matching the filter and removes it.
    // It returns the deleted document (so we can check if it was the default).
    const deletedCard = await PaymentMethod.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id, // Ownership check — prevents IDOR attacks
    });

    // If no card was found, either:
    //   - The ID doesn't exist
    //   - The card belongs to someone else (userId didn't match)
    // Either way, we return 404.
    if (!deletedCard) {
      return res.status(404).json({ message: "Payment method not found" });
    }

    // If the deleted card WAS the default, promote another card.
    if (deletedCard.isDefault) {
      // findOne returns the first matching document.
      // Since we don't specify a sort, it returns the oldest card
      const nextCard = await PaymentMethod.findOne({ userId: req.user._id });

      // If there are remaining cards, make the first one default.
      // If nextCard is null (no cards left), we do nothing — the user
      if (nextCard) {
        nextCard.isDefault = true;
        await nextCard.save();
      }
    }

    res.json({ message: "Payment method deleted" });
  } catch (error) {
    console.error("deletePaymentMethod error:", error);
    res.status(500).json({ message: "Server error deleting payment method" });
  }
};

// ============================================================
// PUT /api/customer/payment-methods/:id/default
// ============================================================
// Sets a specific payment method as the default.
// ============================================================
const setDefaultPaymentMethod = async (req, res) => {
  try {
    // Step 1: Remove default from ALL user's cards
    await PaymentMethod.updateMany(
      { userId: req.user._id },
      { isDefault: false }
    );

    // Step 2: Set the requested card as default
    // { new: true } returns the UPDATED document, not the old one.
    const paymentMethod = await PaymentMethod.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id }, // Ownership check
      { isDefault: true },
      { new: true }
    );

    if (!paymentMethod) {
      return res.status(404).json({ message: "Payment method not found" });
    }

    res.json({ paymentMethod });
  } catch (error) {
    console.error("setDefaultPaymentMethod error:", error);
    res.status(500).json({ message: "Server error setting default payment method" });
  }
};

// ============================================================
// GET /api/customer/notifications/preferences
// ============================================================
// Returns the user's notification preferences.
// ============================================================
const getNotificationPreferences = async (req, res) => {
  try {
    res.json({ preferences: req.user.notificationPreferences });
  } catch (error) {
    console.error("getNotificationPreferences error:", error);
    res.status(500).json({ message: "Server error fetching notification preferences" });
  }
};

// ============================================================
// PUT /api/customer/notifications/preferences
// ============================================================
// Updates the user's notification preferences.
// ============================================================
const updateNotificationPreferences = async (req, res) => {
  try {
    const { orders, messages, promotions } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        notificationPreferences: {
          orders,
          messages,
          promotions,
        },
      },
      { new: true } // Return the updated document
    );

    res.json({ preferences: updatedUser.notificationPreferences });
  } catch (error) {
    console.error("updateNotificationPreferences error:", error);
    res.status(500).json({ message: "Server error updating notification preferences" });
  }
};

module.exports = {
  getPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
  setDefaultPaymentMethod,
  getNotificationPreferences,
  updateNotificationPreferences,
};
