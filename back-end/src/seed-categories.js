// Seed script — run ONCE to populate the database with initial categories
// Usage: cd back-end && node src/seed-categories.js
//
// What this does:
// 1. Connects to your MongoDB database
// 2. Deletes any existing categories (clean slate)
// 3. Inserts 6 categories with placeholder images
// 4. Logs the result and exits
//
// You only need to run this once. After that, categories are managed via the API.

const dotenv = require("dotenv");
dotenv.config(); // Load .env variables (MONGODB_URI, etc.)

const connectDB = require("./config/db");
const Category = require("./Models/Category");

const categories = [
  {
    name: "التنظيف",
    description: "خدمات التنظيف المنزلي والتجاري",
    image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400",
  },
  {
    name: "الإصلاحات",
    description: "إصلاحات عامة للمنازل والمباني",
    image: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400",
  },
  {
    name: "الصيانة",
    description: "صيانة دورية وتكييف وأجهزة منزلية",
    image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400",
  },
  {
    name: "الكهرباء",
    description: "أعمال كهربائية وتركيبات إضاءة",
    image: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=400",
  },
  {
    name: "السباكة",
    description: "خدمات السباكة وإصلاح التسريبات",
    image: "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=400",
  },
  {
    name: "الدهانات",
    description: "دهانات وديكور داخلي وخارجي",
    image: "https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?w=400",
  },
];

const seedCategories = async () => {
  try {
    await connectDB();

    // Clear existing categories first (clean slate)
    await Category.deleteMany({});
    console.log("Cleared existing categories");

    // Insert all 6 categories at once
    // insertMany is faster than creating them one by one
    const result = await Category.insertMany(categories);
    console.log(`Seeded ${result.length} categories successfully!`);

    // Exit the process — this is a one-time script, not a server
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error.message);
    process.exit(1);
  }
};

seedCategories();
