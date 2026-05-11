const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title:   { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ['info', 'success', 'warning', 'error'],
      default: 'info',
    },
    isRead: { type: Boolean, default: false },
    link:   { type: String, default: null },
  },
  { timestamps: true }
);

// TTL index — MongoDB deletes each notification 86400 seconds (24 hours)
// after its createdAt timestamp. The background job that does the cleanup
// runs every ~60 seconds, so documents may linger up to ~1 min past the
// expiry — that's expected behavior for MongoDB TTL indexes.
//
// NOTE: if you change this value, drop the old index in MongoDB first or
// Mongoose will silently keep the old one (indexes can't be updated in place).
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Notification', notificationSchema);
