const { initializeDatabase } = require("./lib/database");

console.log("Testing database initialization...");
try {
  initializeDatabase();
  console.log("✅ Database initialized successfully!");
} catch (error) {
  console.error("❌ Database initialization failed:", error);
}
