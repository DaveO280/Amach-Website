/**
 * Migration Utility: Remove Old Encryption Keys from localStorage
 *
 * This script removes the old insecure encryption keys that were stored in localStorage.
 * Should be run once after upgrading to wallet-derived encryption.
 */

export function migrateToWalletDerivedEncryption(): {
  keysRemoved: number;
  profilesFound: number;
  message: string;
} {
  console.log("🔄 Starting migration to wallet-derived encryption...");

  let keysRemoved = 0;
  let profilesFound = 0;

  try {
    // Scan localStorage for old encryption keys
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Remove old encryption keys (format: health_encryption_key_{address})
      if (key.startsWith("health_encryption_key_")) {
        keysToRemove.push(key);
        keysRemoved++;
      }

      // Count profiles that will need re-encryption
      if (key.startsWith("health_profile_")) {
        profilesFound++;
      }
    }

    // Remove all old encryption keys
    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
      console.log(`🗑️ Removed old encryption key: ${key}`);
    });

    const message = `Migration complete! Removed ${keysRemoved} old encryption keys. Found ${profilesFound} profiles (will be re-encrypted on next access with wallet signature).`;

    console.log(`✅ ${message}`);

    return {
      keysRemoved,
      profilesFound,
      message,
    };
  } catch (error) {
    console.error("❌ Migration failed:", error);
    return {
      keysRemoved,
      profilesFound,
      message: `Migration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Check if migration is needed
 */
export function needsMigration(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("health_encryption_key_")) {
      return true;
    }
  }
  return false;
}

/**
 * Auto-migrate on app load (call this in app initialization)
 */
export function autoMigrateIfNeeded(): void {
  if (needsMigration()) {
    console.log("⚠️ Old encryption keys detected - running auto-migration...");
    migrateToWalletDerivedEncryption();
  } else {
    console.log("✅ No migration needed - using wallet-derived encryption");
  }
}
