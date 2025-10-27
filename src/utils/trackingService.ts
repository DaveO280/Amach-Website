/**
 * Tracking service for sending user journey data to the admin dashboard
 * This service ensures all user actions are tracked for analytics while maintaining privacy
 */

export interface TrackingData {
  email: string;
  action:
    | "profile_created"
    | "profile_verified"
    | "allocation_claimed"
    | "user_tracked";
  walletAddress?: string;
  profileData?: Record<string, unknown>;
  deviceInfo?: {
    userAgent: string;
    language: string;
    platform: string;
    screenResolution: string;
    timezone: string;
    timestamp: number;
  };
  source?: string;
  proofDetails?: string;
  blockNumber?: number; // Added for verification tracking
  allocationAmount?: string; // Added for allocation tracking
  transactionHash?: string; // Added for allocation tracking
}

class TrackingService {
  constructor() {
    // Admin dashboard URL is now hardcoded in API calls
  }

  /**
   * Send tracking data to admin dashboard
   */
  async trackUserAction(
    trackingData: TrackingData,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Only track on client side
      if (typeof window === "undefined") {
        return {
          success: false,
          error: "Tracking can only be done on client side",
        };
      }

      console.log("📊 Sending tracking data:", {
        action: trackingData.action,
        email: trackingData.email,
        walletAddress: trackingData.walletAddress,
        hasProfileData: !!trackingData.profileData,
        hasDeviceInfo: !!trackingData.deviceInfo,
      });

      const response = await fetch("/api/tracking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(trackingData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Tracking failed:", response.status, errorText);
        return { success: false, error: `Tracking failed: ${response.status}` };
      }

      const result = await response.json();
      console.log("✅ Tracking successful:", result);
      return { success: true };
    } catch (error) {
      console.error("❌ Tracking error:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown tracking error",
      };
    }
  }

  /**
   * Track profile creation
   */
  async trackProfileCreation(
    email: string,
    profileData: Record<string, unknown>,
    walletAddress?: string,
  ): Promise<void> {
    const deviceInfo = this.getDeviceInfo();

    await this.trackUserAction({
      email,
      action: "profile_created",
      walletAddress,
      profileData,
      deviceInfo,
      source: window.location.origin,
      proofDetails: `Profile created with ${Object.keys(profileData).length} fields`,
    });
  }

  /**
   * Track profile verification
   */
  async trackProfileVerification(
    email: string,
    walletAddress: string,
  ): Promise<void> {
    const deviceInfo = this.getDeviceInfo();

    await this.trackUserAction({
      email,
      action: "profile_verified",
      walletAddress,
      deviceInfo,
      source: window.location.origin,
      proofDetails: "Profile verified on-chain via ZKsync SSO",
      blockNumber: Date.now(), // Use timestamp as block number for now
    });
  }

  /**
   * Track allocation claim
   */
  async trackAllocationClaim(
    email: string,
    walletAddress: string,
    amount: string,
    transactionHash?: string,
  ): Promise<void> {
    const deviceInfo = this.getDeviceInfo();

    await this.trackUserAction({
      email,
      action: "allocation_claimed",
      walletAddress,
      deviceInfo,
      source: window.location.origin,
      proofDetails: `Allocation of ${amount} claimed successfully`,
      allocationAmount: amount,
      transactionHash: transactionHash || `tx_${Date.now()}`,
    });
  }

  /**
   * Track initial user visit (when they start the flow)
   */
  async trackUserVisit(email: string): Promise<void> {
    const deviceInfo = this.getDeviceInfo();

    await this.trackUserAction({
      email,
      action: "user_tracked",
      deviceInfo,
      source: window.location.origin,
      proofDetails: "User started verification flow",
    });
  }

  /**
   * Get device information for tracking
   */
  private getDeviceInfo():
    | {
        userAgent: string;
        language: string;
        platform: string;
        screenResolution: string;
        timezone: string;
        timestamp: number;
      }
    | undefined {
    if (typeof window === "undefined") {
      return undefined;
    }

    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: Date.now(),
    };
  }
}

// Export singleton instance
export const trackingService = new TrackingService();
