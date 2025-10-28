// API-based whitelist checker that calls admin app
// This makes HTTP requests to the admin app's API endpoints

// Check if email is whitelisted by calling admin app API
export async function isEmailWhitelisted(email: string): Promise<boolean> {
  try {
    const adminApiUrl =
      process.env.ADMIN_API_URL || "http://localhost:3001/api";
    const response = await fetch(`${adminApiUrl}/whitelist/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      console.error("Admin app API not available:", response.status);
      return false;
    }

    const data = await response.json();
    return data.isWhitelisted === true;
  } catch (error) {
    console.error("Error checking email whitelist via API:", error);
    return false;
  }
}

// Utility function to hash email
export function hashEmail(email: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(email.toLowerCase()).digest("hex");
}

// Get all whitelisted emails (for admin purposes)
export async function getWhitelistedEmails(): Promise<
  Array<{
    email: string;
    status: string;
    addedAt: string;
    addedBy: string;
  }>
> {
  try {
    const adminApiUrl =
      process.env.ADMIN_API_URL || "http://localhost:3001/api";
    const response = await fetch(`${adminApiUrl}/whitelist`);

    if (!response.ok) {
      console.error("Admin app API not available:", response.status);
      return [];
    }

    const data = await response.json();
    return data.whitelist || [];
  } catch (error) {
    console.error("Error getting whitelisted emails:", error);
    return [];
  }
}

// Add email to whitelist
export async function addEmailToWhitelist(
  email: string,
  addedBy: string = "admin@amachhealth.com",
): Promise<boolean> {
  try {
    const adminApiUrl =
      process.env.ADMIN_API_URL || "http://localhost:3001/api";
    const response = await fetch(`${adminApiUrl}/whitelist/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, addedBy }),
    });

    if (!response.ok) {
      console.error("Failed to add email to whitelist:", response.status);
      return false;
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("Error adding email to whitelist:", error);
    return false;
  }
}

// Remove email from whitelist
export async function removeEmailFromWhitelist(
  email: string,
): Promise<boolean> {
  try {
    const adminApiUrl =
      process.env.ADMIN_API_URL || "http://localhost:3001/api";
    const response = await fetch(`${adminApiUrl}/whitelist/remove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      console.error("Failed to remove email from whitelist:", response.status);
      return false;
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("Error removing email from whitelist:", error);
    return false;
  }
}

// Update email status
export async function updateEmailStatus(
  email: string,
  status: "active" | "inactive" | "suspended",
): Promise<boolean> {
  try {
    const adminApiUrl =
      process.env.ADMIN_API_URL || "http://localhost:3001/api";
    const response = await fetch(`${adminApiUrl}/whitelist/update-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, status }),
    });

    if (!response.ok) {
      console.error("Failed to update email status:", response.status);
      return false;
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("Error updating email status:", error);
    return false;
  }
}
