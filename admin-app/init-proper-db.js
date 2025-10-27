// Initialize database using the proper TypeScript module
const { initializeDatabase } = require("./lib/database");

console.log("🗄️ Initializing admin database with proper schema...");
initializeDatabase();
console.log("✅ Database initialized successfully!");
