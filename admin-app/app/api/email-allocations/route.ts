import { NextRequest, NextResponse } from "next/server";
import { emailAllocationQueries } from "../../../lib/database";
import { EmailAllocationZKProof } from "../../../lib/email-allocation-zk";

// GET - Get email allocation statistics and verify allocations
export async function GET(): Promise<NextResponse> {
  try {
    // Get all stored allocation proofs
    const allAllocations =
      emailAllocationQueries.getAllAllocations.all() as Array<{
        email: string;
        email_hash: string;
        allocation_amount: string;
        allocation_proof: string;
        transaction_hash: string;
        timestamp: number;
        nonce: string;
      }>;

    // Get allocation statistics
    const stats = emailAllocationQueries.getAllocationStats.get() as
      | {
          total_allocations: number;
          total_amount: number;
          unique_emails: number;
          average_allocation: number;
        }
      | undefined;

    // Convert to EmailAllocationProof format for verification
    const allocationProofs = allAllocations.map((allocation) => ({
      email: allocation.email,
      emailHash: allocation.email_hash,
      allocationAmount: allocation.allocation_amount,
      allocationProof: allocation.allocation_proof,
      transactionHash: allocation.transaction_hash,
      timestamp: allocation.timestamp,
      nonce: allocation.nonce,
    }));

    // Verify all proofs and get stats
    const verifiedStats =
      await EmailAllocationZKProof.getAllocationStats(allocationProofs);

    return NextResponse.json({
      success: true,
      stats: {
        totalAllocations: stats?.total_allocations || 0,
        totalAllocatedAmount: stats?.total_amount || 0,
        uniqueEmails: stats?.unique_emails || 0,
        averageAllocation: stats?.average_allocation || 0,
        verifiedAllocations: verifiedStats.totalAllocations,
        verifiedAmount: verifiedStats.totalAllocatedAmount,
      },
      allocations: allocationProofs.map((proof) => ({
        email: proof.email,
        emailHash: proof.emailHash,
        allocationAmount: proof.allocationAmount,
        transactionHash: proof.transactionHash,
        timestamp: proof.timestamp,
      })),
    });
  } catch (error) {
    console.error("Failed to get email allocations:", error);
    return NextResponse.json(
      { error: "Failed to retrieve email allocations" },
      { status: 500 },
    );
  }
}

// POST - Record new email allocation (called after successful token claim)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, allocationAmount, transactionHash } = await request.json();

    if (!email || !allocationAmount || !transactionHash) {
      return NextResponse.json(
        {
          error: "Email, allocation amount, and transaction hash are required",
        },
        { status: 400 },
      );
    }

    // Generate the allocation proof
    const proof = await EmailAllocationZKProof.generateAllocationProof(
      email,
      allocationAmount,
      transactionHash,
    );

    // Store in database (email visible, NO wallet address)
    emailAllocationQueries.addAllocation.run(
      proof.email,
      proof.emailHash,
      proof.allocationAmount,
      proof.allocationProof,
      proof.transactionHash,
      proof.timestamp,
      proof.nonce,
    );

    console.log("📝 Email allocation recorded:", {
      email: proof.email,
      emailHash: proof.emailHash,
      allocationAmount: proof.allocationAmount,
      transactionHash: proof.transactionHash,
      note: "NO wallet address stored - complete wallet privacy maintained",
    });

    return NextResponse.json({
      success: true,
      message: "Email allocation recorded successfully",
      proof: {
        email: proof.email,
        emailHash: proof.emailHash,
        allocationAmount: proof.allocationAmount,
        transactionHash: proof.transactionHash,
        timestamp: proof.timestamp,
      },
    });
  } catch (error) {
    console.error("Failed to record email allocation:", error);
    return NextResponse.json(
      { error: "Failed to record email allocation" },
      { status: 500 },
    );
  }
}

// PUT - Verify email allocation
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Get all stored allocation proofs
    const allAllocations =
      emailAllocationQueries.getAllAllocations.all() as Array<{
        email: string;
        email_hash: string;
        allocation_amount: string;
        allocation_proof: string;
        transaction_hash: string;
        timestamp: number;
        nonce: string;
      }>;

    // Convert to EmailAllocationProof format
    const allocationProofs = allAllocations.map((allocation) => ({
      email: allocation.email,
      emailHash: allocation.email_hash,
      allocationAmount: allocation.allocation_amount,
      allocationProof: allocation.allocation_proof,
      transactionHash: allocation.transaction_hash,
      timestamp: allocation.timestamp,
      nonce: allocation.nonce,
    }));

    // Hash the email and verify allocation
    const { createHash } = await import("crypto");
    const emailHash = createHash("sha256")
      .update(email.toLowerCase())
      .digest("hex");
    const verification = await EmailAllocationZKProof.checkEmailAllocation(
      emailHash,
      allocationProofs,
    );

    return NextResponse.json({
      success: true,
      verification,
    });
  } catch (error) {
    console.error("Failed to verify email allocation:", error);
    return NextResponse.json(
      { error: "Failed to verify email allocation" },
      { status: 500 },
    );
  }
}
