import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import crypto from "crypto";
import { ethers } from "ethers";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
    credentials: true,
  }),
);
app.use(express.json());

// In-memory storage for demo (use database in production)
const users = new Map();
const challenges = new Map();
const emailWhitelist = new Set();
const verifiedUsers = new Map(); // email -> { wallet, userId, timestamp, hasReceivedTokens }

// Contract configuration
const PROFILE_VERIFICATION_CONTRACT =
  process.env.PROFILE_VERIFICATION_CONTRACT || "";
const HEALTH_TOKEN_CONTRACT = process.env.HEALTH_TOKEN_CONTRACT || "";
const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || "";

// Initialize provider and signer for contract interactions
let provider, signer, profileVerificationContract, healthTokenContract;
if (PROFILE_VERIFICATION_CONTRACT && PRIVATE_KEY) {
  provider = new ethers.JsonRpcProvider(
    process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev",
  );
  signer = new ethers.Wallet(PRIVATE_KEY, provider);

  // Contract ABIs (simplified)
  const profileVerificationABI = [
    "function isEmailWhitelisted(string memory email) external view returns (bool)",
    "function isEmailInUse(string memory email) external view returns (bool)",
    "function isWalletInUse(address wallet) external view returns (bool)",
    "function verifyProfile(string memory email, bytes memory signature) external",
    "function getUserVerification(address user) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
    "function getTokenAllocationStatus() external view returns (tuple(uint256 totalAllocated, uint256 maxAllocations, uint256 allocationPerUser, bool isActive))",
  ];

  const healthTokenABI = [
    "function grantInitialAllocation(address user, uint256 amount) external",
    "function getRemainingInitialAllocations() external view returns (uint256)",
    "function hasUserReceivedInitialAllocation(address user) external view returns (bool)",
  ];

  profileVerificationContract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    profileVerificationABI,
    signer,
  );
  healthTokenContract = new ethers.Contract(
    HEALTH_TOKEN_CONTRACT,
    healthTokenABI,
    signer,
  );
}

// ZKsync SSO Configuration
const rpName = process.env.RP_NAME || "Amach Health";
const rpID = process.env.RP_ID || "localhost";
const origin = process.env.RP_ORIGIN || "http://localhost:3000";

console.log("🔐 Starting Amach Health ZKsync SSO Auth Server...");
console.log(`📡 Server running on port ${PORT}`);
console.log(`🌐 CORS enabled for: ${process.env.ALLOWED_ORIGINS}`);

// Root endpoint (required for ZKsync SSO popup)
app.get("/", (req, res) => {
  res.json({
    message: "Amach Health ZKsync SSO Auth Server",
    status: "running",
    timestamp: new Date().toISOString(),
    service: "Amach Health ZKsync SSO Auth Server",
    endpoints: [
      "/health",
      "/config",
      "/auth/register/options",
      "/auth/register/verify",
      "/auth/login/options",
      "/auth/login/verify",
    ],
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Amach Health ZKsync SSO Auth Server",
  });
});

// Get server configuration
app.get("/config", (req, res) => {
  res.json({
    rpName,
    rpID,
    origin,
    zkSyncRpcUrl: process.env.ZKSYNC_RPC_URL,
    zkSyncChainId: process.env.ZKSYNC_CHAIN_ID,
    // Contract addresses will be added after deployment
    contracts: {
      accountFactory: process.env.ACCOUNT_FACTORY_ADDRESS || "",
      passkey: process.env.PASSKEY_ADDRESS || "",
      session: process.env.SESSION_ADDRESS || "",
      paymaster: process.env.PAYMASTER_ADDRESS || "",
    },
  });
});

// Generate registration options for new users
app.post("/auth/register/options", async (req, res) => {
  try {
    const { username, displayName } = req.body;

    if (!username || !displayName) {
      return res
        .status(400)
        .json({ error: "Username and displayName are required" });
    }

    // Check if user already exists
    if (users.has(username)) {
      return res.status(409).json({ error: "User already exists" });
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: crypto.randomUUID(),
      userName: username,
      userDisplayName: displayName,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform",
      },
    });

    // Store challenge
    challenges.set(username, options.challenge);

    console.log(`📝 Generated registration options for user: ${username}`);
    res.json(options);
  } catch (error) {
    console.error("❌ Registration options error:", error);
    res.status(500).json({ error: "Failed to generate registration options" });
  }
});

// Verify registration response
app.post("/auth/register/verify", async (req, res) => {
  try {
    const { username, response } = req.body;

    if (!username || !response) {
      return res
        .status(400)
        .json({ error: "Username and response are required" });
    }

    const expectedChallenge = challenges.get(username);
    if (!expectedChallenge) {
      return res.status(400).json({ error: "No challenge found for user" });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (verification.verified) {
      // Store user
      users.set(username, {
        id: verification.registrationInfo.userID,
        username,
        publicKey: verification.registrationInfo.credentialPublicKey,
        counter: verification.registrationInfo.counter,
        createdAt: new Date().toISOString(),
      });

      // Clear challenge
      challenges.delete(username);

      console.log(`✅ User registered successfully: ${username}`);
      res.json({
        success: true,
        user: { username, id: verification.registrationInfo.userID },
      });
    } else {
      console.log(`❌ Registration verification failed for user: ${username}`);
      res.status(400).json({ error: "Registration verification failed" });
    }
  } catch (error) {
    console.error("❌ Registration verification error:", error);
    res.status(500).json({ error: "Failed to verify registration" });
  }
});

// Generate authentication options for existing users
app.post("/auth/login/options", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const user = users.get(username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: [
        {
          id: user.publicKey,
          type: "public-key",
          transports: ["internal"],
        },
      ],
      userVerification: "preferred",
    });

    // Store challenge
    challenges.set(username, options.challenge);

    console.log(`🔑 Generated authentication options for user: ${username}`);
    res.json(options);
  } catch (error) {
    console.error("❌ Authentication options error:", error);
    res
      .status(500)
      .json({ error: "Failed to generate authentication options" });
  }
});

// Verify authentication response
app.post("/auth/login/verify", async (req, res) => {
  try {
    const { username, response } = req.body;

    if (!username || !response) {
      return res
        .status(400)
        .json({ error: "Username and response are required" });
    }

    const user = users.get(username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const expectedChallenge = challenges.get(username);
    if (!expectedChallenge) {
      return res.status(400).json({ error: "No challenge found for user" });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: user.publicKey,
        credentialPublicKey: user.publicKey,
        counter: user.counter,
      },
    });

    if (verification.verified) {
      // Update counter
      user.counter = verification.authenticationInfo.newCounter;
      users.set(username, user);

      // Clear challenge
      challenges.delete(username);

      console.log(`✅ User authenticated successfully: ${username}`);
      res.json({
        success: true,
        user: { username, id: user.id },
        session: {
          token: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        },
      });
    } else {
      console.log(
        `❌ Authentication verification failed for user: ${username}`,
      );
      res.status(400).json({ error: "Authentication verification failed" });
    }
  } catch (error) {
    console.error("❌ Authentication verification error:", error);
    res.status(500).json({ error: "Failed to verify authentication" });
  }
});

// Get user info
app.get("/auth/user/:username", (req, res) => {
  const { username } = req.params;
  const user = users.get(username);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    username: user.username,
    id: user.id,
    createdAt: user.createdAt,
  });
});

// List all users (for debugging)
app.get("/auth/users", (req, res) => {
  const userList = Array.from(users.values()).map((user) => ({
    username: user.username,
    id: user.id,
    createdAt: user.createdAt,
  }));

  res.json({ users: userList, count: userList.length });
});

// Profile Verification Endpoints

// Check if email is whitelisted
app.post("/verification/check-email", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Check against contract if available
    if (profileVerificationContract) {
      const [isWhitelisted, isInUse] = await Promise.all([
        profileVerificationContract.isEmailWhitelisted(email),
        profileVerificationContract.isEmailInUse(email),
      ]);

      res.json({
        email,
        isWhitelisted,
        isInUse,
        canProceed: isWhitelisted && !isInUse,
      });
    } else {
      // Fallback to local whitelist for demo
      const isWhitelisted = emailWhitelist.has(email);
      res.json({
        email,
        isWhitelisted,
        isInUse: false,
        canProceed: isWhitelisted,
      });
    }
  } catch (error) {
    console.error("❌ Email check error:", error);
    res.status(500).json({ error: "Failed to check email" });
  }
});

// Verify user profile
app.post("/verification/verify-profile", async (req, res) => {
  try {
    const { email, walletAddress, signature } = req.body;

    if (!email || !walletAddress || !signature) {
      return res
        .status(400)
        .json({ error: "Email, wallet address, and signature are required" });
    }

    // Check if email is whitelisted
    if (profileVerificationContract) {
      const isWhitelisted =
        await profileVerificationContract.isEmailWhitelisted(email);
      if (!isWhitelisted) {
        return res.status(400).json({ error: "Email is not whitelisted" });
      }

      // Call contract verification
      const tx = await profileVerificationContract.verifyProfile(
        email,
        signature,
      );
      await tx.wait();

      // Get verification data
      const verification =
        await profileVerificationContract.getUserVerification(walletAddress);

      res.json({
        success: true,
        transactionHash: tx.hash,
        verification: {
          email: verification.email,
          wallet: verification.wallet,
          userId: Number(verification.userId),
          timestamp: new Date(
            Number(verification.timestamp) * 1000,
          ).toISOString(),
          isActive: verification.isActive,
          hasReceivedTokens: verification.hasReceivedTokens,
          tokenAllocation: ethers.formatEther(verification.tokenAllocation),
        },
      });
    } else {
      // Fallback for demo
      const verificationId = verifiedUsers.size + 1;
      verifiedUsers.set(email, {
        wallet: walletAddress,
        userId: verificationId,
        timestamp: new Date().toISOString(),
        hasReceivedTokens: true,
        tokenAllocation: "1000",
      });

      res.json({
        success: true,
        verification: {
          email,
          wallet: walletAddress,
          userId: verificationId,
          timestamp: new Date().toISOString(),
          isActive: true,
          hasReceivedTokens: true,
          tokenAllocation: "1000",
        },
      });
    }
  } catch (error) {
    console.error("❌ Profile verification error:", error);
    res.status(500).json({ error: "Failed to verify profile" });
  }
});

// Get allocation info
app.get("/verification/allocation-info", async (req, res) => {
  try {
    if (profileVerificationContract) {
      const allocationConfig =
        await profileVerificationContract.getAllocationConfig();

      res.json({
        totalAllocated: Number(allocationConfig.totalAllocated),
        remainingAllocations:
          Number(allocationConfig.maxAllocations) -
          Number(allocationConfig.totalAllocated),
        allocationPerUser: ethers.formatEther(
          allocationConfig.allocationPerUser,
        ),
        isActive: allocationConfig.isActive,
      });
    } else {
      // Fallback for demo
      res.json({
        totalAllocated: verifiedUsers.size,
        remainingAllocations: Math.max(0, 5000 - verifiedUsers.size),
        allocationPerUser: "1000.0",
        isActive: true,
      });
    }
  } catch (error) {
    console.error("❌ Allocation info error:", error);
    res.status(500).json({ error: "Failed to get allocation info" });
  }
});

// Admin endpoints (these would need proper authentication in production)

// Get verification stats
app.get("/admin/verification-stats", async (req, res) => {
  try {
    // Check admin authentication (implement proper auth)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (profileVerificationContract) {
      const [totalVerifiedUsers, allocationConfig, isVerificationActive] =
        await Promise.all([
          profileVerificationContract.getTotalVerifiedUsers(),
          profileVerificationContract.getAllocationConfig(),
          profileVerificationContract.verificationEnabled(),
        ]);

      res.json({
        totalVerifiedUsers: Number(totalVerifiedUsers),
        totalAllocations: Number(allocationConfig.totalAllocated),
        remainingAllocations:
          Number(allocationConfig.maxAllocations) -
          Number(allocationConfig.totalAllocated),
        isVerificationActive: isVerificationActive,
      });
    } else {
      // Fallback for demo
      res.json({
        totalVerifiedUsers: verifiedUsers.size,
        totalAllocations: verifiedUsers.size,
        remainingAllocations: Math.max(0, 5000 - verifiedUsers.size),
        isVerificationActive: true,
      });
    }
  } catch (error) {
    console.error("❌ Stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// Get email whitelist
app.get("/admin/email-whitelist", async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Return whitelist (this would need to be tracked off-chain or through events)
    const whitelist = Array.from(emailWhitelist.entries()).map(
      ([email, data]) => ({
        email,
        isWhitelisted: true,
        addedAt: data.addedAt,
        addedBy: data.addedBy,
      }),
    );

    res.json(whitelist);
  } catch (error) {
    console.error("❌ Whitelist error:", error);
    res.status(500).json({ error: "Failed to get whitelist" });
  }
});

// Modify email whitelist
app.post("/admin/email-whitelist", async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { email, action } = req.body;

    if (!email || !action) {
      return res.status(400).json({ error: "Email and action are required" });
    }

    if (action === "add") {
      if (profileVerificationContract) {
        const tx = await profileVerificationContract.addEmailToWhitelist(email);
        await tx.wait();
      }

      emailWhitelist.set(email, {
        addedAt: new Date().toISOString(),
        addedBy: "admin",
      });

      res.json({ success: true, email, action });
    } else if (action === "remove") {
      if (profileVerificationContract) {
        const tx =
          await profileVerificationContract.removeEmailFromWhitelist(email);
        await tx.wait();
      }

      emailWhitelist.delete(email);

      res.json({ success: true, email, action });
    } else {
      res.status(400).json({ error: "Invalid action" });
    }
  } catch (error) {
    console.error("❌ Whitelist modification error:", error);
    res.status(500).json({ error: "Failed to modify whitelist" });
  }
});

// Get verified users
app.get("/admin/verified-users", async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Return verified users (this would need to be tracked off-chain or through events)
    const users = Array.from(verifiedUsers.entries()).map(([email, data]) => ({
      email,
      wallet: data.wallet,
      userId: data.userId,
      timestamp: data.timestamp,
      hasReceivedTokens: data.hasReceivedTokens,
      tokenAllocation: data.tokenAllocation,
    }));

    res.json(users);
  } catch (error) {
    console.error("❌ Verified users error:", error);
    res.status(500).json({ error: "Failed to get verified users" });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("🚨 Server error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(
    `🚀 Amach Health ZKsync SSO Auth Server running on http://localhost:${PORT}`,
  );
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /config - Server configuration`);
  console.log(`   POST /auth/register/options - Generate registration options`);
  console.log(`   POST /auth/register/verify - Verify registration`);
  console.log(`   POST /auth/login/options - Generate authentication options`);
  console.log(`   POST /auth/login/verify - Verify authentication`);
  console.log(`   GET  /auth/user/:username - Get user info`);
  console.log(`   GET  /auth/users - List all users`);
});
