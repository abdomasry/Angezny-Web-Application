const mongoose = require('mongoose');
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: String,
    image: String, // URL to category image (placeholder for now, upload system later)
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Text index for the navbar autocomplete + filter sidebar's category search.
categorySchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("Category", categorySchema);