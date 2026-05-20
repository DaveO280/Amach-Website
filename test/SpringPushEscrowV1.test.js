/* eslint-disable no-console */
const { expect } = require("chai");
const { ethers } = require("hardhat");

const PRIZE_POOL = ethers.utils.parseEther("10");
const BASELINE = "0x" + "ab".repeat(32);
const FINISH = "0x" + "cd".repeat(32);
const METRIC = "0x" + "ef".repeat(32);

// Per-user baseline roots — each test participant commits their own root at
// register() time, so the contract no longer carries a contest-wide baseline.
// `baselineForPlayer` derives a distinct, deterministic, non-zero root from
// the participant address. Tests that need a known root (e.g. the
// BaselineMismatch check) reuse it via the same helper.
function baselineForPlayer(address) {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["address"], [address]),
  );
}
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

function pubSignals(improvementBp, baseline = BASELINE, signFlag = 0) {
  return [
    ethers.BigNumber.from(baseline),
    ethers.BigNumber.from(FINISH),
    ethers.BigNumber.from(METRIC),
    ethers.BigNumber.from(improvementBp),
    ethers.BigNumber.from(signFlag),
  ];
}

// Register every wallet in `players` against its own per-address baseline
// root, and return the {address: root} map so callers can reference each
// player's committed root in the rest of the test. Each participant supplies
// a distinct, non-zero root — matching the production flow where each user
// commits their own baseline at register() time.
async function registerAll(escrow, players) {
  const roots = {};
  for (const p of players) {
    const root = baselineForPlayer(p.address);
    roots[p.address] = root;
    await escrow.connect(p).register(root);
  }
  return roots;
}

// Build the pubSignals tuple for a participant using their own committed
// baseline root. `roots` is the map returned by `registerAll`.
function pubSignalsFor(player, roots, improvementBp, signFlag = 0) {
  return pubSignals(improvementBp, roots[player.address], signFlag);
}

// Dummy Groth16 proof points. The mock verifier ignores their values, so any
// in-field uint256 will do; the escrow only inspects pubSignals before the
// verifier call.
const PROOF_PA = [1, 2];
const PROOF_PB = [
  [1, 2],
  [3, 4],
];
const PROOF_PC = [5, 6];

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

async function deployFixture(opts = {}) {
  const {
    shouldAcceptProofs = true,
    contestDuration = CONTEST_DURATION,
    claimWindow = CLAIM_WINDOW,
    maxParticipants = MAX_PARTICIPANTS,
    minParticipants = MIN_PARTICIPANTS,
  } = opts;

  const signers = await ethers.getSigners();
  const [deployer, admin] = signers;

  const MockVerifier = await ethers.getContractFactory("MockGroth16Verifier");
  const verifier = await MockVerifier.deploy(shouldAcceptProofs);
  await verifier.deployed();

  const Escrow = await ethers.getContractFactory("SpringPushEscrowV1");
  const escrow = await Escrow.deploy(
    verifier.address,
    admin.address,
    contestDuration,
    claimWindow,
    maxParticipants,
    minParticipants,
  );
  await escrow.deployed();

  return { escrow, verifier, deployer, admin, signers };
}

// -------------------------------------------------------------
// tests
// -------------------------------------------------------------

describe("SpringPushEscrowV1", function () {
  this.timeout(180000);

  describe("constructor + immutables", () => {
    const validArgs = (overrides = {}) => ({
      verifier: overrides.verifier,
      admin: overrides.admin,
      contestDuration: overrides.contestDuration ?? CONTEST_DURATION,
      claimWindow: overrides.claimWindow ?? CLAIM_WINDOW,
      maxParticipants: overrides.maxParticipants ?? MAX_PARTICIPANTS,
      minParticipants: overrides.minParticipants ?? MIN_PARTICIPANTS,
    });

    async function tryDeploy(args) {
      const Escrow = await ethers.getContractFactory("SpringPushEscrowV1");
      return {
        Escrow,
        promise: Escrow.deploy(
          args.verifier,
          args.admin,
          args.contestDuration,
          args.claimWindow,
          args.maxParticipants,
          args.minParticipants,
        ),
      };
    }

    it("rejects zero verifier or admin", async () => {
      const [d] = await ethers.getSigners();
      let { Escrow, promise } = await tryDeploy(
        validArgs({ verifier: ethers.constants.AddressZero, admin: d.address }),
      );
      await expectCustomError(promise, Escrow, "ZeroAddress");

      ({ Escrow, promise } = await tryDeploy(
        validArgs({ verifier: d.address, admin: ethers.constants.AddressZero }),
      ));
      await expectCustomError(promise, Escrow, "ZeroAddress");
    });

    it("rejects param values below their floors", async () => {
      const [d] = await ethers.getSigners();
      const baseValid = { verifier: d.address, admin: d.address };

      const cases = [
        { contestDuration: 59 },
        { claimWindow: 59 },
        { maxParticipants: 1 },
        { minParticipants: 0 },
        { minParticipants: 11, maxParticipants: 10 }, // min > max
      ];
      for (const override of cases) {
        const { Escrow, promise } = await tryDeploy(
          validArgs({ ...baseValid, ...override }),
        );
        await expectCustomError(promise, Escrow, "InvalidParams");
      }
    });

    it("accepts the floor values exactly", async () => {
      const [d] = await ethers.getSigners();
      const { promise } = await tryDeploy({
        verifier: d.address,
        admin: d.address,
        contestDuration: 60,
        claimWindow: 60,
        maxParticipants: 2,
        minParticipants: 1,
      });
      const escrow = await promise;
      await escrow.deployed();
      eq(await escrow.CONTEST_DURATION(), 60);
      eq(await escrow.MAX_PARTICIPANTS(), 2);
    });

    it("locks immutable parameters at deploy time", async () => {
      const { escrow, verifier, admin } = await deployFixture();
      eq(await escrow.CONTEST_DURATION(), CONTEST_DURATION);
      eq(await escrow.CLAIM_WINDOW(), CLAIM_WINDOW);
      eq(await escrow.MAX_PARTICIPANTS(), MAX_PARTICIPANTS);
      eq(await escrow.MIN_PARTICIPANTS(), MIN_PARTICIPANTS);
      eq(await escrow.FOUNDER_RECLAIM_DELAY(), FOUNDER_RECLAIM_DELAY);
      expect(await escrow.IMPROVEMENT_VERIFIER()).to.equal(verifier.address);
      expect(await escrow.ADMIN()).to.equal(admin.address);
      eq(await escrow.state(), State.UNINITIALIZED);
    });

    it("supports custom timing for speed-run-style deploys", async () => {
      const { escrow } = await deployFixture({
        contestDuration: 300,
        claimWindow: 180,
        maxParticipants: 5,
        minParticipants: 2,
      });
      eq(await escrow.CONTEST_DURATION(), 300);
      eq(await escrow.CLAIM_WINDOW(), 180);
      eq(await escrow.MAX_PARTICIPANTS(), 5);
      eq(await escrow.MIN_PARTICIPANTS(), 2);
    });
  });

  describe("registration lifecycle", () => {
    it("happy path: open → register MIN → close → ACTIVE", async () => {
      const { escrow, deployer, admin } = await deployFixture();

      await expectCustomError(
        escrow.connect(deployer).openRegistration({ value: PRIZE_POOL }),
        escrow,
        "NotAdmin",
      );

      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });

      eq(await escrow.state(), State.REGISTRATION_OPEN);
      eq(await escrow.prizePool(), PRIZE_POOL);

      const players = await createFundedWallets(MIN_PARTICIPANTS, "1");
      const roots = await registerAll(escrow, players);
      eq(await escrow.participantCount(), MIN_PARTICIPANTS);

      // Each participant's committed baseline root is pinned on-chain and
      // distinct from every other participant's.
      for (const p of players) {
        expect(await escrow.participantBaselineRoot(p.address)).to.equal(
          roots[p.address],
        );
      }

      await escrow.connect(admin).closeRegistration();
      eq(await escrow.state(), State.ACTIVE);
    });

    it("rejects double-open", async () => {
      const { escrow, admin } = await deployFixture();
      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });
      await expectCustomError(
        escrow.connect(admin).openRegistration({ value: PRIZE_POOL }),
        escrow,
        "WrongState",
      );
    });

    it("rejects open with zero prize pool", async () => {
      const { escrow, admin } = await deployFixture();
      await expectCustomError(
        escrow.connect(admin).openRegistration({ value: 0 }),
        escrow,
        "ZeroValue",
      );
    });

    it("rejects register() with a zero baseline root", async () => {
      const { escrow, admin } = await deployFixture();
      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });
      const [p] = await createFundedWallets(1, "1");
      await expectCustomError(
        escrow.connect(p).register(ethers.constants.HashZero),
        escrow,
        "ZeroBaselineRoot",
      );
    });

    it("rejects duplicate registration from the same address", async () => {
      const { escrow, admin } = await deployFixture();
      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });
      const [p] = await createFundedWallets(1, "1");
      await escrow.connect(p).register(baselineForPlayer(p.address));
      await expectCustomError(
        escrow.connect(p).register(baselineForPlayer(p.address)),
        escrow,
        "AlreadyRegistered",
      );
    });

    it("rejects registration outside REGISTRATION_OPEN", async () => {
      const { escrow } = await deployFixture();
      const [p] = await createFundedWallets(1, "1");
      await expectCustomError(
        escrow.connect(p).register(baselineForPlayer(p.address)),
        escrow,
        "WrongState",
      );
    });

    it("blocks blind ETH transfers via receive()", async () => {
      const { escrow, deployer } = await deployFixture();
      await expectRevert(
        deployer.sendTransaction({
          to: escrow.address,
          value: ethers.utils.parseEther("0.01"),
        }),
      );
    });

    it("enforces MAX_PARTICIPANTS cap", async () => {
      const { escrow, admin } = await deployFixture();
      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });

      const players = await createFundedWallets(MAX_PARTICIPANTS, "1");
      await registerAll(escrow, players);
      eq(await escrow.participantCount(), MAX_PARTICIPANTS);

      const [overflow] = await createFundedWallets(1, "1");
      await expectCustomError(
        escrow.connect(overflow).register(baselineForPlayer(overflow.address)),
        escrow,
        "CapacityReached",
      );
    });

    it("transitions to FAILED when below MIN_PARTICIPANTS at close", async () => {
      const { escrow, admin } = await deployFixture();
      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });

      const tooFew = await createFundedWallets(MIN_PARTICIPANTS - 1, "1");
      await registerAll(escrow, tooFew);

      await escrow.connect(admin).closeRegistration();
      eq(await escrow.state(), State.FAILED);
    });
  });

  describe("submitProof + finalize", () => {
    async function setupActiveContest(numPlayers = MIN_PARTICIPANTS) {
      const fixture = await deployFixture();
      const { escrow, admin } = fixture;
      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });
      const players = await createFundedWallets(numPlayers, "1");
      const roots = await registerAll(escrow, players);
      await escrow.connect(admin).closeRegistration();
      return { ...fixture, players, roots };
    }

    it("verifies proof, stores improvementBp, blocks duplicates", async () => {
      const { escrow, players, roots } = await setupActiveContest();
      const p = players[0];

      await escrow
        .connect(p)
        .submitProof(
          PROOF_PA,
          PROOF_PB,
          PROOF_PC,
          pubSignalsFor(p, roots, 500),
        );
      eq(await escrow.improvementBp(p.address), 500);

      await expectCustomError(
        escrow
          .connect(p)
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignalsFor(p, roots, 700),
          ),
        escrow,
        "AlreadySubmitted",
      );
    });

    it("rejects bad baseline, zero improvement, invalid proof, unregistered sender", async () => {
      const { escrow, verifier, players, roots } = await setupActiveContest();
      const p0 = players[0];

      // Using another participant's root must fail — the contract checks
      // pubSignals[0] against msg.sender's committed root, not anyone else's.
      const otherRoot = roots[players[1].address];
      await expectCustomError(
        escrow
          .connect(p0)
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignals(100, otherRoot),
          ),
        escrow,
        "BaselineMismatch",
      );

      // A root not committed by anyone also fails for the same reason.
      const wrongBaseline = "0x" + "11".repeat(32);
      await expectCustomError(
        escrow
          .connect(p0)
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignals(100, wrongBaseline),
          ),
        escrow,
        "BaselineMismatch",
      );

      await expectCustomError(
        escrow
          .connect(p0)
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignalsFor(p0, roots, 0),
          ),
        escrow,
        "ImprovementZero",
      );

      // signFlag = 1 marks a negative improvement; Spring Push entries must be
      // positive, so the escrow rejects with NegativeImprovement.
      await expectCustomError(
        escrow
          .connect(p0)
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignalsFor(p0, roots, 100, 1),
          ),
        escrow,
        "NegativeImprovement",
      );

      await verifier.setShouldAccept(false);
      await expectCustomError(
        escrow
          .connect(p0)
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignalsFor(p0, roots, 100),
          ),
        escrow,
        "InvalidProof",
      );
      await verifier.setShouldAccept(true);

      const [stranger] = await createFundedWallets(1, "1");
      await expectCustomError(
        escrow
          .connect(stranger)
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignals(100, baselineForPlayer(stranger.address)),
          ),
        escrow,
        "NotRegistered",
      );
    });

    it("requires sorted, no-duplicate participant list at finalize", async () => {
      const { escrow, admin, players, roots } = await setupActiveContest();

      // player[i] gets improvement (100 + i*10) — strictly increasing.
      for (let i = 0; i < players.length; i++) {
        await escrow
          .connect(players[i])
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignalsFor(players[i], roots, 100 + i * 10),
          );
      }

      await increaseTime(CONTEST_DURATION + CLAIM_WINDOW + 1);

      // Ascending registration order = wrong (sort must be DESC).
      await expectCustomError(
        escrow.connect(admin).finalize(players.map((s) => s.address)),
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
        escrow.connect(admin).finalize(withDupe),
        escrow,
        "DuplicateInRanking",
      );

      await escrow.connect(admin).finalize(sortedDesc.map((s) => s.address));
      eq(await escrow.state(), State.FINISHED);
      eq(await escrow.qualifierCount(), players.length);
    });

    it("rejects finalize before claim window ends", async () => {
      const { escrow, admin, players, roots } = await setupActiveContest();
      await escrow
        .connect(players[0])
        .submitProof(
          PROOF_PA,
          PROOF_PB,
          PROOF_PC,
          pubSignalsFor(players[0], roots, 100),
        );
      await increaseTime(CONTEST_DURATION + 1);
      await expectCustomError(
        escrow.connect(admin).finalize([players[0].address]),
        escrow,
        "TooEarly",
      );
    });
  });

  describe("claimPrize + tier math", () => {
    it("happy path: ranks 1-10 → tier 1, 11-30 → tier 2, 31+ → tier 3", async () => {
      const numPlayers = 35;
      const fixture = await deployFixture();
      const { escrow, admin } = fixture;
      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });
      const players = await createFundedWallets(numPlayers, "1");
      const roots = await registerAll(escrow, players);
      await escrow.connect(admin).closeRegistration();

      // player[0] gets the highest score → ends up rank 1.
      for (let i = 0; i < players.length; i++) {
        const score = (numPlayers - i) * 100;
        await escrow
          .connect(players[i])
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignalsFor(players[i], roots, score),
          );
      }

      await increaseTime(CONTEST_DURATION + CLAIM_WINDOW + 1);
      await escrow.connect(admin).finalize(players.map((p) => p.address));

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
        eq(received, s.expected);
      }

      await expectCustomError(
        escrow.connect(samples[0].player).claimPrize(),
        escrow,
        "AlreadyClaimed",
      );
    });

    it("claimPrize survives forced ETH via selfdestruct (no InvariantBroken)", async () => {
      // Regression test for the address(this).balance invariant footgun:
      // an attacker can force ETH into the escrow via selfdestruct, which —
      // with the old check — would make balance + totalClaimed != prizePool
      // and brick every claim. The fix tracks the seeded balance manually.
      const { escrow, admin } = await deployFixture();
      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });
      const players = await createFundedWallets(MIN_PARTICIPANTS, "1");
      const roots = await registerAll(escrow, players);
      await escrow.connect(admin).closeRegistration();
      for (let i = 0; i < players.length; i++) {
        await escrow
          .connect(players[i])
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignalsFor(players[i], roots, 2000 - i * 10),
          );
      }
      await increaseTime(CONTEST_DURATION + CLAIM_WINDOW + 1);
      await escrow.connect(admin).finalize(players.map((p) => p.address));

      // Force ETH into the escrow via a selfdestructing helper. After this
      // call, address(escrow).balance > prizePool, which would have tripped
      // the old invariant.
      const Attacker = await ethers.getContractFactory("SelfDestructAttacker");
      const forcedAmount = ethers.utils.parseEther("0.5");
      const attacker = await Attacker.deploy(escrow.address, {
        value: forcedAmount,
      });
      await attacker.deployed();

      const escrowBal = await ethers.provider.getBalance(escrow.address);
      expect(escrowBal.gt(PRIZE_POOL)).to.equal(true);

      // claimPrize must succeed — the fix uses a tracked balance instead of
      // address(this).balance, so forced ETH cannot brick the invariant.
      await escrow.connect(players[0]).claimPrize();
      expect(await escrow.claimed(players[0].address)).to.equal(true);
    });

    it("rejects claim without proof (NotQualified)", async () => {
      const { escrow, admin } = await deployFixture();
      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });
      const players = await createFundedWallets(MIN_PARTICIPANTS, "1");
      const roots = await registerAll(escrow, players);
      await escrow.connect(admin).closeRegistration();

      const submitters = players.slice(0, 10);
      const skipped = players[10];
      for (let i = 0; i < submitters.length; i++) {
        await escrow
          .connect(submitters[i])
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignalsFor(submitters[i], roots, 1000 - i * 10),
          );
      }

      await increaseTime(CONTEST_DURATION + CLAIM_WINDOW + 1);
      await escrow.connect(admin).finalize(submitters.map((s) => s.address));

      await expectCustomError(
        escrow.connect(skipped).claimPrize(),
        escrow,
        "NotQualified",
      );
    });
  });

  describe("founderReclaim", () => {
    async function setupFinalized() {
      const fixture = await deployFixture();
      const { escrow, admin } = fixture;
      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });
      const players = await createFundedWallets(MIN_PARTICIPANTS, "1");
      const roots = await registerAll(escrow, players);
      await escrow.connect(admin).closeRegistration();
      for (let i = 0; i < players.length; i++) {
        await escrow
          .connect(players[i])
          .submitProof(
            PROOF_PA,
            PROOF_PB,
            PROOF_PC,
            pubSignalsFor(players[i], roots, 2000 - i * 10),
          );
      }
      await increaseTime(CONTEST_DURATION + CLAIM_WINDOW + 1);
      await escrow.connect(admin).finalize(players.map((p) => p.address));
      return { ...fixture, players, roots };
    }

    it("reverts before contestCloseTime + 180 days", async () => {
      const { escrow, admin, signers } = await setupFinalized();
      await expectCustomError(
        escrow.connect(admin).founderReclaim(signers[0].address),
        escrow,
        "TooEarly",
      );
    });

    it("reverts when called by non-admin", async () => {
      const { escrow, signers } = await setupFinalized();
      await increaseTime(FOUNDER_RECLAIM_DELAY + 1);
      await expectCustomError(
        escrow.connect(signers[0]).founderReclaim(signers[0].address),
        escrow,
        "NotAdmin",
      );
    });

    it("sweeps residual ETH to target after 180d", async () => {
      const { escrow, admin, signers, players } = await setupFinalized();

      // Have one player claim; the remaining 19 leave residual in escrow.
      await escrow.connect(players[0]).claimPrize();

      await increaseTime(FOUNDER_RECLAIM_DELAY + 1);

      const target = signers[5];
      const targetBefore = await ethers.provider.getBalance(target.address);
      const escrowBefore = await ethers.provider.getBalance(escrow.address);

      await escrow.connect(admin).founderReclaim(target.address);

      const targetAfter = await ethers.provider.getBalance(target.address);
      const escrowAfter = await ethers.provider.getBalance(escrow.address);
      eq(targetAfter.sub(targetBefore), escrowBefore);
      eq(escrowAfter, 0);
    });

    it("reverts on zero balance after sweep", async () => {
      const { escrow, admin, signers } = await setupFinalized();
      await increaseTime(FOUNDER_RECLAIM_DELAY + 1);
      await escrow.connect(admin).founderReclaim(signers[5].address);
      await expectCustomError(
        escrow.connect(admin).founderReclaim(signers[5].address),
        escrow,
        "ZeroValue",
      );
    });

    async function setupFailed() {
      const fixture = await deployFixture();
      const { escrow, admin } = fixture;
      await escrow.connect(admin).openRegistration({ value: PRIZE_POOL });
      const tooFew = await createFundedWallets(MIN_PARTICIPANTS - 1, "1");
      await registerAll(escrow, tooFew);
      await escrow.connect(admin).closeRegistration();
      return fixture;
    }

    it("anchors the reclaim clock when the contest FAILS at registration close", async () => {
      const { escrow } = await setupFailed();
      // The fix: contestCloseTime must be set on the FAILED transition so the
      // seeded prize pool isn't permanently locked in escrow.
      const closeTime = await escrow.contestCloseTime();
      expect(closeTime.gt(0)).to.equal(true);
      eq(await escrow.state(), State.FAILED);
    });

    it("FAILED: reverts before contestCloseTime + 180 days", async () => {
      const { escrow, admin, signers } = await setupFailed();
      await expectCustomError(
        escrow.connect(admin).founderReclaim(signers[0].address),
        escrow,
        "TooEarly",
      );
    });

    it("FAILED: sweeps seeded prize pool to target after 180d", async () => {
      const { escrow, admin, signers } = await setupFailed();
      await increaseTime(FOUNDER_RECLAIM_DELAY + 1);

      const target = signers[5];
      const targetBefore = await ethers.provider.getBalance(target.address);
      const escrowBefore = await ethers.provider.getBalance(escrow.address);
      eq(escrowBefore, PRIZE_POOL);

      await escrow.connect(admin).founderReclaim(target.address);

      const targetAfter = await ethers.provider.getBalance(target.address);
      const escrowAfter = await ethers.provider.getBalance(escrow.address);
      eq(targetAfter.sub(targetBefore), PRIZE_POOL);
      eq(escrowAfter, 0);
    });
  });
});
