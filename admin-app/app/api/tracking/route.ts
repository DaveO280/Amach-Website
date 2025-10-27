import { NextRequest, NextResponse } from "next/server";
import {
  db,
  trackingQueries,
  hashEmail,
  hashDeviceFingerprint,
  hashSource,
} from "@/lib/database";
import { ZKProofGenerator, ZKProofVerifier } from "@/lib/zk-proofs";

export const runtime = "nodejs";

// GET - Get user tracking analytics (privacy-preserving)
export async function GET(): Promise<NextResponse> {
  try {
    type AnalyticsData = {
      total_whitelisted: number;
      total_with_profiles: number;
      total_verified: number;
      total_claimed: number;
    };
    type TrackingData = {
      email_hash: string;
      email: string | null;
      profile_hash: string | null;
      device_fingerprint_hash: string | null;
      source_hash: string | null;
      profile_completion_proof: string | null;
      verification_proof: string | null;
      allocation_proof: string | null;
      created_at: string;
      updated_at: string;
    };

    const analytics = trackingQueries.getAnalytics.get() as
      | AnalyticsData
      | undefined;
    const allTracking =
      trackingQueries.getAllUserTracking.all() as TrackingData[];

    // Return privacy-preserving analytics (no allocation tracking - blockchain only)
    const privacyPreservingAnalytics = {
      totalWhitelisted: analytics?.total_whitelisted || 0,
      totalWithProfiles: analytics?.total_with_profiles || 0,
      totalVerified: analytics?.total_verified || 0,
      totalClaimed: analytics?.total_claimed || 0,
      conversionRates: {
        profileCreation:
          analytics?.total_whitelisted && analytics.total_whitelisted > 0
            ? Math.round(
                (analytics.total_with_profiles / analytics.total_whitelisted) *
                  100,
              )
            : 0,
        verification:
          analytics?.total_with_profiles && analytics.total_with_profiles > 0
            ? Math.round(
                (analytics.total_verified / analytics.total_with_profiles) *
                  100,
              )
            : 0,
        // Allocation tracking removed - handled by blockchain data only
        allocation: 0,
      },
    };

    // Return user tracking data with actual emails
    const privacyPreservingTracking = allTracking.map((item: TrackingData) => ({
      emailHash: item.email_hash,
      email: item.email, // Include actual email for admin dashboard
      profileHash: item.profile_hash,
      deviceFingerprintHash: item.device_fingerprint_hash,
      sourceHash: item.source_hash,
      hasProfile: !!item.profile_completion_proof,
      hasVerification: !!item.verification_proof,
      hasAllocation: !!item.allocation_proof,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    return NextResponse.json({
      success: true,
      analytics: privacyPreservingAnalytics,
      tracking: privacyPreservingTracking,
    });
  } catch (error) {
    console.error("Failed to get tracking data:", error);
    return NextResponse.json(
      { error: "Failed to fetch tracking data" },
      { status: 500 },
    );
  }
}

// POST - Update user tracking with ZK-proofs
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const {
      email,
      action,
      walletAddress,
      deviceFingerprint,
      source,
      profile,
      blockNumber,
      allocationAmount,
      transactionHash,
    } = await request.json();

    if (!email || !action) {
      return NextResponse.json(
        { error: "Email and action are required" },
        { status: 400 },
      );
    }

    const emailHash = hashEmail(email);
    let result;

    switch (action) {
      case "track_user":
        // Track new user with device fingerprint
        if (!deviceFingerprint || !source) {
          return NextResponse.json(
            {
              error:
                "Device fingerprint and source are required for user tracking",
            },
            { status: 400 },
          );
        }

        const deviceHash = hashDeviceFingerprint(deviceFingerprint);
        const sourceHash = hashSource(source);

        // Check if user already exists
        const existingUser = trackingQueries.getUserTracking.get(emailHash);

        if (existingUser) {
          // Update existing user with new device/source info
          db.prepare(
            `
            UPDATE user_tracking 
            SET device_fingerprint_hash = ?, source_hash = ?, updated_at = CURRENT_TIMESTAMP
            WHERE email_hash = ?
          `,
          ).run(deviceHash, sourceHash, emailHash);
        } else {
          // Create new user tracking entry (NO wallet address stored for privacy)
          trackingQueries.addUser.run(emailHash, deviceHash, sourceHash);
        }

        result = { emailHash, deviceHash, sourceHash, action: "user_tracked" };
        break;

      case "profile_created":
        // Track profile creation with ZK-proof
        if (!profile) {
          return NextResponse.json(
            { error: "Profile data is required for profile creation tracking" },
            { status: 400 },
          );
        }

        const profileCompletionProof =
          await ZKProofGenerator.generateProfileCompletionProof(profile);
        trackingQueries.updateUserProfile.run(
          profileCompletionProof.profileHash,
          profileCompletionProof.completionProof,
          emailHash,
        );

        result = {
          emailHash,
          profileHash: profileCompletionProof.profileHash,
          completenessScore: profileCompletionProof.completenessScore,
          action: "profile_created",
        };
        break;

      case "profile_verified":
        // Track on-chain verification (simplified without ZK-proof for now)
        if (!walletAddress) {
          return NextResponse.json(
            { error: "Wallet address is required for verification tracking" },
            { status: 400 },
          );
        }

        // Check if user exists in whitelist, if not add them
        const whitelistEntryVerification = db
          .prepare(`SELECT * FROM whitelist_proofs WHERE email_hash = ?`)
          .get(emailHash);
        if (!whitelistEntryVerification) {
          // Add to whitelist first (required for foreign key constraint)
          db.prepare(
            `
            INSERT INTO whitelist_proofs (email, email_hash, whitelist_proof, added_by, status)
            VALUES (?, ?, ?, ?, ?)
          `,
          ).run(
            email,
            emailHash,
            `auto_added_${Date.now()}`,
            "system",
            "active",
          );
        }

        // Check if user exists in tracking, if not create them
        const existingUserForVerification =
          trackingQueries.getUserTracking.get(emailHash);
        if (!existingUserForVerification) {
          trackingQueries.addUser.run(emailHash, null, null);
        }

        // Update verification status
        trackingQueries.updateUserVerification.run("verified", emailHash);

        result = {
          emailHash,
          verificationProof: "verified",
          blockNumber: blockNumber || Date.now(),
          action: "profile_verified",
        };
        break;

      case "allocation_claimed":
        // Allocations are now tracked purely through blockchain data
        // No database tracking needed - claim rate calculated from blockchain
        console.log("📊 Allocation claimed - tracked via blockchain only:", {
          allocationAmount,
          transactionHash,
        });

        result = {
          allocationAmount,
          transactionHash,
          action: "allocation_claimed",
          blockchainOnly: true, // Indicates this is blockchain-only tracking
        };
        break;

      default:
        return NextResponse.json(
          {
            error:
              "Invalid action. Use: track_user, profile_created, profile_verified, allocation_claimed",
          },
          { status: 400 },
        );
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Failed to update tracking:", error);
    console.error("Error details:", errorMessage);
    console.error("Stack trace:", errorStack);
    return NextResponse.json(
      { error: "Failed to update tracking", details: errorMessage },
      { status: 500 },
    );
  }
}

// PUT - Verify ZK-proofs
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const { proofType, proof, expectedData } = await request.json();

    if (!proofType || !proof) {
      return NextResponse.json(
        { error: "Proof type and proof are required" },
        { status: 400 },
      );
    }

    let isValid = false;
    let verificationResult = {};

    switch (proofType) {
      case "email_ownership":
        isValid = ZKProofVerifier.verifyEmailOwnershipProof(
          proof,
          expectedData?.whitelistProof,
        );
        verificationResult = { emailHash: proof.emailHash, isValid };
        break;

      case "device_consistency":
        isValid = ZKProofVerifier.verifyDeviceConsistencyProof(
          proof,
          expectedData?.previousDeviceHash,
        );
        verificationResult = { deviceHash: proof.deviceHash, isValid };
        break;

      case "profile_completion":
        isValid = ZKProofVerifier.verifyProfileCompletionProof(
          proof,
          expectedData?.minScore,
        );
        verificationResult = {
          profileHash: proof.profileHash,
          completenessScore: proof.completenessScore,
          isValid,
        };
        break;

      case "verification":
        isValid = ZKProofVerifier.verifyVerificationProof(proof);
        verificationResult = { isValid }; // No wallet address stored for privacy
        break;

      case "allocation":
        isValid = ZKProofVerifier.verifyAllocationProof(proof);
        verificationResult = {
          allocationAmount: proof.allocationAmount,
          transactionHash: proof.transactionHash,
          isValid,
        };
        break;

      default:
        return NextResponse.json(
          { error: "Invalid proof type" },
          { status: 400 },
        );
    }

    return NextResponse.json({
      success: true,
      proofType,
      verificationResult,
    });
  } catch (error) {
    console.error("Failed to verify proof:", error);
    return NextResponse.json(
      { error: "Failed to verify proof" },
      { status: 500 },
    );
  }
}
