import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { healthDataStore } from "../data/store/healthDataStore";
import { HealthContext } from "../types/HealthContext";

// Shared randomChoice utility
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// Export HealthContext as JSON
export function exportContext(context: HealthContext): void {
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(context, null, 2));
  const downloadAnchorNode = document.createElement("a");
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "amach_health_context.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

// Import HealthContext from JSON file
export function importContext(setContext: (ctx: HealthContext) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = (event: Event): void => {
    const fileInput = event.target as HTMLInputElement;
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>): void => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (imported && typeof imported === "object" && imported.version) {
          setContext(imported);
        } else {
          alert("Invalid file format.");
        }
      } catch {
        alert("Failed to import context.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

export function formatSleepTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

// Comprehensive backup function that exports both health context and health data
export async function exportCompleteBackup(
  context: HealthContext,
): Promise<void> {
  try {
    console.log("🔄 Starting comprehensive backup...");

    // Export health data from IndexedDB
    const healthData = await healthDataStore.exportData();

    // Create complete backup object
    const completeBackup = {
      version: 2,
      timestamp: new Date().toISOString(),
      healthContext: context,
      healthData: JSON.parse(healthData), // Parse the JSON string back to object
    };

    // Convert to JSON string with proper formatting
    const backupString = JSON.stringify(completeBackup, null, 2);

    // Create download
    const dataStr =
      "data:text/json;charset=utf-8," + encodeURIComponent(backupString);
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute(
      "download",
      `amach_health_backup_${new Date().toISOString().split("T")[0]}.json`,
    );
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();

    console.log("✅ Backup completed successfully");
  } catch (error) {
    console.error("❌ Backup failed:", error);
    throw new Error(
      `Backup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// Import complete backup
export async function importCompleteBackup(
  setContext: (ctx: HealthContext) => void,
): Promise<void> {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = async (event: Event): Promise<void> => {
    const fileInput = event.target as HTMLInputElement;
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (backup && typeof backup === "object") {
        // Handle version 2 backup (complete backup)
        if (backup.version === 2 && backup.healthContext && backup.healthData) {
          // Import health data to IndexedDB
          await healthDataStore.importData(JSON.stringify(backup.healthData));

          // Import health context
          setContext(backup.healthContext);

          console.log("✅ Complete backup imported successfully");
          return;
        }

        // Handle version 1 backup (health context only)
        if (backup.version === 1) {
          setContext(backup);
          console.log("✅ Health context imported successfully");
          return;
        }
      }

      alert("Invalid backup file format.");
    } catch (error) {
      console.error("❌ Import failed:", error);
      alert("Failed to import backup file.");
    }
  };
  input.click();
}
