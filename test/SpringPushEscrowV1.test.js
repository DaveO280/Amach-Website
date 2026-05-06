/* eslint-disable no-console */
const { expect } = require("chai");
const { ethers } = require("hardhat");

const ENTRY_FEE = ethers.utils.parseEther("0.01");
const PRIZE_POOL = ethers.utils.parseEther("10");
const BASELINE = "0x" + "ab".repeat(32);
const FINISH = "0x" + "cd".repeat(32);
const METRIC = "0x" + "ef".repeat(32);
const CONTEST_DURATION = 90 * 24 * 60 * 60;
const CLAIM_WINDOW = 30 * 24 * 60 * 60;
const FOUNDER_RECLAIM_DELAY = 180 * 24 * 60 * 60;
const MIN_PARTICIPANTS = 20;
const MAX_PARTICIPANTS = 100;

const State = {
  UNINITIALIZED: 0,
  REGISTRATION_OPEN: 1,
  ACTIVE: 2,
  CLAIMING: 3,
  FINISHED: 4,
  FAILED: 5,
};

// -------------------------------------------------------------
// helpers
// -------------------------------------------------------------

async function increaseTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

async function fundWallet(address, etherStr) {
  const wei = ethers.utils.parseEther(etherStr).toHexString();
  await ethers.provider.send("hardhat_setBalance", [
    address,
    "0x" + wei.replace(/^0x0*/, ""),
  ]);
}

async function createFundedWallets(count, ether = "1") {
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const w = ethers.Wallet.createRandom().connect(ethers.provider);
    await fundWallet(w.address, ether);
    wallets.push(w);
  }
  return wallets;
}

function pubSignals(improvementBp, baseline = BASELINE) {
  return [
    ethers.BigNumber.from(baseline),
    ethers.BigNumber.from(FINISH),
    ethers.BigNumber.from(METRIC),
    ethers.BigNumber.from(improvementBp),
  ];
}

/// Strict numeric equality between any two BigNumber-like values.
function eq(actual, expected) {
  const a = ethers.BigNumber.from(actual);
  const e = ethers.BigNumber.from(expected);
  expect(a.eq(e), `expected ${e.toString()}, got ${a.toString()}`).to.equal(
    true,
  );
}

/// Decode a custom error name from a thrown ProviderError or ethers revert.
function decodeCustomError(err, iface) {
  // Try every plausible spot return data could surface.
  const candidates = [
    err && err.data,
    err && err.error && err.error.data,
    err && err.error && err.error.error && err.error.error.data,
    err && err.message,
    err && err.error && err.error.message,
  ].filter(Boolean);
  let hex = null;
  for (const c of candidates) {
    const s =
      typeof c === "string" ? c : (c && c.data) || (c && c.message) || "";
    const m = String(s).match(/0x[0-9a-fA-F]{8,}/);
    if (m) {
      hex = m[0];
      break;
    }
  }
  if (!hex) return null;
  const selector = hex.slice(0, 10);
  for (const fragment of Object.values(iface.errors)) {
    if (iface.getSighash(fragment) === selector) return fragment.name;
  }
  return null;
}

async function expectCustomError(promise, contractOrFactory, errorName) {
  const iface =
    (contractOrFactory && contractOrFactory.interface) || contractOrFactory;
  let threw = false;
  try {
    const tx = await promise;
    if (tx && tx.wait) await tx.wait();
  } catch (err) {
    threw = true;
    const decoded = decodeCustomError(err, iface);
    if (decoded !== errorName) {
      const msg = err.message || "";
      if (!msg.includes(errorName)) {
        throw new Error(
          `Expected revert with ${errorName}; saw selector→${decoded}\n  msg: ${msg}`,
        );
      }
    }
  }
  if (!threw) {
    throw new Error(`Expected revert with ${errorName}, no revert occurred`);
  }
}

async function expectRevert(promise) {
  let threw = false;
  try {
    const tx = await promise;
    if (tx && tx.wait) await tx.wait();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected revert, no revert occurred");
}

async function gasCost(receipt, tx) {
  const price = receipt.effectiveGasPrice || tx.gasPrice;
  return receipt.gasUsed.mul(price);
}

async function deployFixture(shouldAcceptProofs = true) {
  const signers = await ethers.getSigners();
  const [deployer, multiSig] = signers;

  const MockVerifier = await ethers.getContractFactory("MockGroth16Verifier");
  const verifier = await MockVerifier.deploy(shouldAcceptProofs);
  await verifier.deployed();

  const Escrow = await ethers.getContractFactory("SpringPushEscrowV1");
  const escrow = await Escrow.deploy(verifier.address, multiSig.address);
  await escrow.deployed();

  return { escrow, verifier, deployer, multiSig, signers };
}

// -------------------------------------------------------------
// tests
// -------------------------------------------------------------

describe("SpringPushEscrowV1", function () {
  this.timeout(180000);

  describe("constructor + immutables", () => {
    it("rejects zero verifier or multi-sig", async () => {
      const Escrow = await ethers.getContractFactory("SpringPushEscrowV1");
      const [d] = await ethers.getSigners();
      await expectCustomError(
        Escrow.deploy(ethers.constants.AddressZero, d.address),
        Escrow,
        "ZeroAddress",
      );
      await expectCustomError(
        Escrow.deploy(d.address, ethers.constants.AddressZero),
        Escrow,
        "ZeroAddress",
      );
    });

    it("locks immutable parameters at deploy time", async () => {
      const { escrow, verifier, multiSig } = await deployFixture();
      eq(await escrow.CONTEST_DURATION(), CONTEST_DURATION);
      eq(await escrow.CLAIM_WINDOW(), CLAIM_WINDOW);
      eq(await escrow.MAX_PARTICIPANTS(), MAX_PARTICIPANTS);
      eq(await escrow.MIN_PARTICIPANTS(), MIN_PARTICIPANTS);
      eq(await escrow.FOUNDER_RECLAIM_DELAY(), FOUNDER_RECLAIM_DELAY);
      expect(await escrow.IMPROVEMENT_VERIFIER()).to.equal(verifier.address);
      expect(await escrow.MULTI_SIG()).to.equal(multiSig.address);
      eq(await escrow.state(), State.UNINITIALIZED);
    });
  });

  describe("registration lifecycle", () => {
    it("happy path: open → register MIN → close → ACTIVE", async () => {
      const { escrow, deployer, multiSig } = await deployFixture();

      await expectCustomError(
        escrow
          .connect(deployer)
          .openRegistration(BASELINE, { value: PRIZE_POOL }),
        escrow,
        "NotMultiSig",
      );

      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });

      eq(await escrow.state(), State.REGISTRATION_OPEN);
      eq(await escrow.prizePool(), PRIZE_POOL);
      expect(await escrow.baselineRoot()).to.equal(BASELINE);

      const players = await createFundedWallets(MIN_PARTICIPANTS, "1");
      for (const p of players) {
        await escrow.connect(p).register({ value: ENTRY_FEE });
      }
      eq(await escrow.participantCount(), MIN_PARTICIPANTS);
      eq(await escrow.entryFeesTotal(), ENTRY_FEE.mul(MIN_PARTICIPANTS));

      await escrow.connect(multiSig).closeRegistration();
      eq(await escrow.state(), State.ACTIVE);
    });

    it("rejects double-open", async () => {
      const { escrow, multiSig } = await deployFixture();
      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });
      await expectCustomError(
        escrow
          .connect(multiSig)
          .openRegistration(BASELINE, { value: PRIZE_POOL }),
        escrow,
        "WrongState",
      );
    });

    it("rejects open with zero prize pool or zero baseline", async () => {
      const { escrow, multiSig } = await deployFixture();
      await expectCustomError(
        escrow.connect(multiSig).openRegistration(BASELINE, { value: 0 }),
        escrow,
        "ZeroValue",
      );
      await expectCustomError(
        escrow
          .connect(multiSig)
          .openRegistration(ethers.constants.HashZero, { value: PRIZE_POOL }),
        escrow,
        "ZeroValue",
      );
    });

    it("rejects duplicate registration from the same address", async () => {
      const { escrow, multiSig } = await deployFixture();
      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });
      const [p] = await createFundedWallets(1, "1");
      await escrow.connect(p).register({ value: ENTRY_FEE });
      await expectCustomError(
        escrow.connect(p).register({ value: ENTRY_FEE }),
        escrow,
        "AlreadyRegistered",
      );
    });

    it("rejects registration outside REGISTRATION_OPEN", async () => {
      const { escrow } = await deployFixture();
      const [p] = await createFundedWallets(1, "1");
      await expectCustomError(
        escrow.connect(p).register({ value: ENTRY_FEE }),
        escrow,
        "WrongState",
      );
    });

    it("rejects zero-value registration", async () => {
      const { escrow, multiSig } = await deployFixture();
      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });
      const [p] = await createFundedWallets(1, "1");
      await expectCustomError(
        escrow.connect(p).register({ value: 0 }),
        escrow,
        "ZeroValue",
      );
    });

    it("blocks blind ETH transfers via receive()", async () => {
      const { escrow, deployer } = await deployFixture();
      await expectRevert(
        deployer.sendTransaction({ to: escrow.address, value: ENTRY_FEE }),
      );
    });

    it("enforces MAX_PARTICIPANTS cap", async () => {
      const { escrow, multiSig } = await deployFixture();
      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });

      const players = await createFundedWallets(MAX_PARTICIPANTS, "1");
      for (const p of players) {
        await escrow.connect(p).register({ value: ENTRY_FEE });
      }
      eq(await escrow.participantCount(), MAX_PARTICIPANTS);

      const [overflow] = await createFundedWallets(1, "1");
      await expectCustomError(
        escrow.connect(overflow).register({ value: ENTRY_FEE }),
        escrow,
        "CapacityReached",
      );
    });

    it("transitions to FAILED when below MIN_PARTICIPANTS at close", async () => {
      const { escrow, multiSig } = await deployFixture();
      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });

      const tooFew = await createFundedWallets(MIN_PARTICIPANTS - 1, "1");
      for (const p of tooFew) {
        await escrow.connect(p).register({ value: ENTRY_FEE });
      }

      await escrow.connect(multiSig).closeRegistration();
      eq(await escrow.state(), State.FAILED);
    });
  });

  describe("submitProof + finalize", () => {
    async function setupActiveContest(numPlayers = MIN_PARTICIPANTS) {
      const fixture = await deployFixture();
      const { escrow, multiSig } = fixture;
      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });
      const players = await createFundedWallets(numPlayers, "1");
      for (const p of players) {
        await escrow.connect(p).register({ value: ENTRY_FEE });
      }
      await escrow.connect(multiSig).closeRegistration();
      return { ...fixture, players };
    }

    it("verifies proof, stores improvementBp, blocks duplicates", async () => {
      const { escrow, players } = await setupActiveContest();
      const p = players[0];

      await escrow.connect(p).submitProof("0x1234", pubSignals(500));
      eq(await escrow.improvementBp(p.address), 500);

      await expectCustomError(
        escrow.connect(p).submitProof("0x1234", pubSignals(700)),
        escrow,
        "AlreadySubmitted",
      );
    });

    it("rejects bad baseline, zero improvement, invalid proof, unregistered sender", async () => {
      const { escrow, verifier, players } = await setupActiveContest();

      const wrongBaseline = "0x" + "11".repeat(32);
      await expectCustomError(
        escrow
          .connect(players[0])
          .submitProof("0x", pubSignals(100, wrongBaseline)),
        escrow,
        "BaselineMismatch",
      );

      await expectCustomError(
        escrow.connect(players[0]).submitProof("0x", pubSignals(0)),
        escrow,
        "ImprovementZero",
      );

      await verifier.setShouldAccept(false);
      await expectCustomError(
        escrow.connect(players[0]).submitProof("0x", pubSignals(100)),
        escrow,
        "InvalidProof",
      );
      await verifier.setShouldAccept(true);

      const [stranger] = await createFundedWallets(1, "1");
      await expectCustomError(
        escrow.connect(stranger).submitProof("0x", pubSignals(100)),
        escrow,
        "NotRegistered",
      );
    });

    it("requires sorted, no-duplicate participant list at finalize", async () => {
      const { escrow, multiSig, players } = await setupActiveContest();

      // player[i] gets improvement (100 + i*10) — strictly increasing.
      for (let i = 0; i < players.length; i++) {
        await escrow
          .connect(players[i])
          .submitProof("0x", pubSignals(100 + i * 10));
      }

      await increaseTime(CONTEST_DURATION + CLAIM_WINDOW + 1);

      // Ascending registration order = wrong (sort must be DESC).
      await expectCustomError(
        escrow.connect(multiSig).finalize(players.map((s) => s.address)),
        escrow,
        "NotSorted",
      );

      // Descending = reversed registration order.
      const sortedDesc = [...players].reverse();
      const withDupe = [
        sortedDesc[0].address,
        sortedDesc[0].address,
        ...sortedDesc.slice(1).map((s) => s.address),
      ];
      await expectCustomError(
        escrow.connect(multiSig).finalize(withDupe),
        escrow,
        "DuplicateInRanking",
      );

      await escrow.connect(multiSig).finalize(sortedDesc.map((s) => s.address));
      eq(await escrow.state(), State.FINISHED);
      eq(await escrow.qualifierCount(), players.length);
    });

    it("rejects finalize before claim window ends", async () => {
      const { escrow, multiSig, players } = await setupActiveContest();
      await escrow.connect(players[0]).submitProof("0x", pubSignals(100));
      await increaseTime(CONTEST_DURATION + 1);
      await expectCustomError(
        escrow.connect(multiSig).finalize([players[0].address]),
        escrow,
        "TooEarly",
      );
    });
  });

  describe("claimPrize + tier math", () => {
    it("happy path: ranks 1-10 → tier 1, 11-30 → tier 2, 31+ → tier 3", async () => {
      const numPlayers = 35;
      const fixture = await deployFixture();
      const { escrow, multiSig } = fixture;
      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });
      const players = await createFundedWallets(numPlayers, "1");
      for (const p of players) {
        await escrow.connect(p).register({ value: ENTRY_FEE });
      }
      await escrow.connect(multiSig).closeRegistration();

      // player[0] gets the highest score → ends up rank 1.
      for (let i = 0; i < players.length; i++) {
        const score = (numPlayers - i) * 100;
        await escrow.connect(players[i]).submitProof("0x", pubSignals(score));
      }

      await increaseTime(CONTEST_DURATION + CLAIM_WINDOW + 1);
      await escrow.connect(multiSig).finalize(players.map((p) => p.address));

      eq(await escrow.qualifierCount(), numPlayers);

      const tier1Each = PRIZE_POOL.mul(6000).div(10000 * 10);
      const tier2Each = PRIZE_POOL.mul(2500).div(10000 * 20);
      const tier3Count = numPlayers - 30;
      const tier3Each = PRIZE_POOL.mul(1500).div(10000 * tier3Count);

      const samples = [
        { player: players[0], expected: tier1Each, tier: 1 },
        { player: players[15], expected: tier2Each, tier: 2 },
        { player: players[30], expected: tier3Each, tier: 3 },
      ];

      for (const s of samples) {
        const before = await ethers.provider.getBalance(s.player.address);
        const tx = await escrow.connect(s.player).claimPrize();
        const rcpt = await tx.wait();
        const cost = await gasCost(rcpt, tx);
        const after = await ethers.provider.getBalance(s.player.address);
        const received = after.sub(before).add(cost);
        eq(received, s.expected.add(ENTRY_FEE));
      }

      await expectCustomError(
        escrow.connect(samples[0].player).claimPrize(),
        escrow,
        "AlreadyClaimed",
      );
    });

    it("rejects claim without proof (NotQualified)", async () => {
      const { escrow, multiSig } = await deployFixture();
      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });
      const players = await createFundedWallets(MIN_PARTICIPANTS, "1");
      for (const p of players) {
        await escrow.connect(p).register({ value: ENTRY_FEE });
      }
      await escrow.connect(multiSig).closeRegistration();

      const submitters = players.slice(0, 10);
      const skipped = players[10];
      for (let i = 0; i < submitters.length; i++) {
        await escrow
          .connect(submitters[i])
          .submitProof("0x", pubSignals(1000 - i * 10));
      }

      await increaseTime(CONTEST_DURATION + CLAIM_WINDOW + 1);
      await escrow.connect(multiSig).finalize(submitters.map((s) => s.address));

      await expectCustomError(
        escrow.connect(skipped).claimPrize(),
        escrow,
        "NotQualified",
      );
    });
  });

  describe("claimRefund (failed contest)", () => {
    it("refunds entry fee to all registrants on FAILED", async () => {
      const { escrow, multiSig } = await deployFixture();
      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });

      const players = await createFundedWallets(5, "1"); // < MIN
      for (const p of players) {
        await escrow.connect(p).register({ value: ENTRY_FEE });
      }
      await escrow.connect(multiSig).closeRegistration();
      eq(await escrow.state(), State.FAILED);

      for (const p of players) {
        const before = await ethers.provider.getBalance(p.address);
        const tx = await escrow.connect(p).claimRefund();
        const rcpt = await tx.wait();
        const cost = await gasCost(rcpt, tx);
        const after = await ethers.provider.getBalance(p.address);
        eq(after.sub(before).add(cost), ENTRY_FEE);
      }

      await expectCustomError(
        escrow.connect(players[0]).claimRefund(),
        escrow,
        "AlreadyClaimed",
      );
    });

    it("refund only callable in FAILED state", async () => {
      const { escrow, multiSig } = await deployFixture();
      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });
      const [p] = await createFundedWallets(1, "1");
      await escrow.connect(p).register({ value: ENTRY_FEE });
      await expectCustomError(
        escrow.connect(p).claimRefund(),
        escrow,
        "WrongState",
      );
    });
  });

  describe("founderReclaim", () => {
    async function setupFinalized() {
      const fixture = await deployFixture();
      const { escrow, multiSig } = fixture;
      await escrow
        .connect(multiSig)
        .openRegistration(BASELINE, { value: PRIZE_POOL });
      const players = await createFundedWallets(MIN_PARTICIPANTS, "1");
      for (const p of players) {
        await escrow.connect(p).register({ value: ENTRY_FEE });
      }
      await escrow.connect(multiSig).closeRegistration();
      for (let i = 0; i < players.length; i++) {
        await escrow
          .connect(players[i])
          .submitProof("0x", pubSignals(2000 - i * 10));
      }
      await increaseTime(CONTEST_DURATION + CLAIM_WINDOW + 1);
      await escrow.connect(multiSig).finalize(players.map((p) => p.address));
      return { ...fixture, players };
    }

    it("reverts before contestCloseTime + 180 days", async () => {
      const { escrow, multiSig, signers } = await setupFinalized();
      await expectCustomError(
        escrow.connect(multiSig).founderReclaim(signers[0].address),
        escrow,
        "TooEarly",
      );
    });

    it("reverts when called by non-multisig", async () => {
      const { escrow, signers } = await setupFinalized();
      await increaseTime(FOUNDER_RECLAIM_DELAY + 1);
      await expectCustomError(
        escrow.connect(signers[0]).founderReclaim(signers[0].address),
        escrow,
        "NotMultiSig",
      );
    });

    it("sweeps residual ETH to target after 180d", async () => {
      const { escrow, multiSig, signers, players } = await setupFinalized();

      // Have one player claim; the remaining 19 leave residual in escrow.
      await escrow.connect(players[0]).claimPrize();

      await increaseTime(FOUNDER_RECLAIM_DELAY + 1);

      const target = signers[5];
      const targetBefore = await ethers.provider.getBalance(target.address);
      const escrowBefore = await ethers.provider.getBalance(escrow.address);

      await escrow.connect(multiSig).founderReclaim(target.address);

      const targetAfter = await ethers.provider.getBalance(target.address);
      const escrowAfter = await ethers.provider.getBalance(escrow.address);
      eq(targetAfter.sub(targetBefore), escrowBefore);
      eq(escrowAfter, 0);
    });

    it("reverts on zero balance after sweep", async () => {
      const { escrow, multiSig, signers } = await setupFinalized();
      await increaseTime(FOUNDER_RECLAIM_DELAY + 1);
      await escrow.connect(multiSig).founderReclaim(signers[5].address);
      await expectCustomError(
        escrow.connect(multiSig).founderReclaim(signers[5].address),
        escrow,
        "ZeroValue",
      );
    });
  });
});
