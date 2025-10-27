const { initializeDatabase } = require("./lib/database");

console.log("🗄️ Initializing fresh admin database...");
initializeDatabase();
console.log("✅ Admin database initialized successfully!");
console.log("📊 Database schema created with email allocations table");
console.log("🔐 Ready for ZK-proof email allocation tracking");
