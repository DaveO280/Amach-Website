/**
 * Browser console script to export health data from IndexedDB
 *
 * Copy and paste this entire script into your browser console on the Amach Health app.
 * It will download your health data as a JSON file.
 */

(async function exportHealthData() {
  const DB_NAME = "amach-health-db";
  const DB_VERSION = 3;
  const STORE_NAME = "health-data";

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get("current");

      getRequest.onsuccess = () => {
        const result = getRequest.result;
        if (!result || !result.data) {
          reject(new Error("No health data found in IndexedDB"));
          return;
        }

        const data = result.data;
        const jsonString = JSON.stringify(data, null, 2);

        // Create download
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `health-data-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log("✅ Health data exported successfully!");
        console.log(`📊 Metrics: ${Object.keys(data).length} types`);
        console.log(
          `📈 Total records: ${Object.values(data).reduce((sum, arr) => sum + (arr?.length || 0), 0)}`,
        );
        resolve(data);
      };

      getRequest.onerror = () => {
        reject(new Error(`Failed to read data: ${getRequest.error?.message}`));
      };
    };

    request.onupgradeneeded = () => {
      // Database will be created if needed, but we're just reading
      console.log("Database upgrade needed, but continuing...");
    };
  });
})();
