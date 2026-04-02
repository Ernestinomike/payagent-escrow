import { expect } from "chai";
import { ethers } from "hardhat";
import { PayAgentEscrow, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("PayAgentEscrow", () => {
  let escrow: PayAgentEscrow;
  let cUSD: MockERC20;
  let owner: HardhatEthersSigner;
  let employer: HardhatEthersSigner;
  let worker: HardhatEthersSigner;
  let aiAgent: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const DEPOSIT_AMOUNT = ethers.parseUnits("100", 18); // 100 cUSD
  const JOB_TITLE = "Build landing page";
  const JOB_ID = ethers.keccak256(ethers.toUtf8Bytes("job-001"));

  beforeEach(async () => {
    [owner, employer, worker, aiAgent, other] = await ethers.getSigners();

    // Deploy mock cUSD
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    cUSD = await MockERC20Factory.deploy("Celo Dollar", "cUSD");

    // Mint cUSD to employer
    await cUSD.mint(employer.address, ethers.parseUnits("10000", 18));

    // Deploy escrow
    const EscrowFactory = await ethers.getContractFactory("PayAgentEscrow");
    escrow = await EscrowFactory.deploy(await cUSD.getAddress(), aiAgent.address);
  });

  // ─── Deployment ───────────────────────────────────────────────────────────

  describe("Deployment", () => {
    it("sets correct owner", async () => {
      expect(await escrow.owner()).to.equal(owner.address);
    });

    it("sets correct AI agent", async () => {
      expect(await escrow.aiAgent()).to.equal(aiAgent.address);
    });

    it("sets default feeBps = 50", async () => {
      expect(await escrow.feeBps()).to.equal(50n);
    });

    it("stores cUSD address", async () => {
      expect(await escrow.cUSD()).to.equal(await cUSD.getAddress());
    });

    it("rejects zero-address cUSD", async () => {
      const Factory = await ethers.getContractFactory("PayAgentEscrow");
      await expect(
        Factory.deploy(ethers.ZeroAddress, aiAgent.address)
      ).to.be.revertedWith("PayAgent: invalid cUSD address");
    });

    it("rejects zero-address AI agent", async () => {
      const Factory = await ethers.getContractFactory("PayAgentEscrow");
      await expect(
        Factory.deploy(await cUSD.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWith("PayAgent: invalid agent address");
    });
  });

  // ─── Deposit ──────────────────────────────────────────────────────────────

  describe("depositEscrow", () => {
    beforeEach(async () => {
      await cUSD.connect(employer).approve(await escrow.getAddress(), DEPOSIT_AMOUNT);
    });

    it("deposits and records escrow correctly", async () => {
      await escrow.connect(employer).depositEscrow(JOB_ID, worker.address, DEPOSIT_AMOUNT, JOB_TITLE);

      const details = await escrow.getEscrowDetails(JOB_ID);
      const fee = (DEPOSIT_AMOUNT * 50n) / 10_000n;
      const net = DEPOSIT_AMOUNT - fee;

      expect(details.employer).to.equal(employer.address);
      expect(details.worker).to.equal(worker.address);
      expect(details.amount).to.equal(net);
      expect(details.fee).to.equal(fee);
      expect(details.status).to.equal(1); // Escrowed
      expect(details.jobTitle).to.equal(JOB_TITLE);
    });

    it("emits PaymentEscrowed event", async () => {
      await expect(
        escrow.connect(employer).depositEscrow(JOB_ID, worker.address, DEPOSIT_AMOUNT, JOB_TITLE)
      ).to.emit(escrow, "PaymentEscrowed");
    });

    it("transfers cUSD from employer to contract", async () => {
      const escrowAddr = await escrow.getAddress();
      await escrow.connect(employer).depositEscrow(JOB_ID, worker.address, DEPOSIT_AMOUNT, JOB_TITLE);
      expect(await cUSD.balanceOf(escrowAddr)).to.equal(DEPOSIT_AMOUNT);
    });

    it("tracks job in worker and employer mappings", async () => {
      await escrow.connect(employer).depositEscrow(JOB_ID, worker.address, DEPOSIT_AMOUNT, JOB_TITLE);
      const workerJobs = await escrow.getWorkerJobs(worker.address);
      const employerJobs = await escrow.getEmployerJobs(employer.address);
      expect(workerJobs).to.include(JOB_ID);
      expect(employerJobs).to.include(JOB_ID);
    });

    it("rejects duplicate job IDs", async () => {
      await escrow.connect(employer).depositEscrow(JOB_ID, worker.address, DEPOSIT_AMOUNT, JOB_TITLE);
      await cUSD.connect(employer).approve(await escrow.getAddress(), DEPOSIT_AMOUNT);
      await expect(
        escrow.connect(employer).depositEscrow(JOB_ID, worker.address, DEPOSIT_AMOUNT, JOB_TITLE)
      ).to.be.revertedWith("PayAgent: job ID already used");
    });

    it("rejects employer as worker", async () => {
      await expect(
        escrow.connect(employer).depositEscrow(JOB_ID, employer.address, DEPOSIT_AMOUNT, JOB_TITLE)
      ).to.be.revertedWith("PayAgent: employer cannot be worker");
    });

    it("rejects zero amount", async () => {
      await expect(
        escrow.connect(employer).depositEscrow(JOB_ID, worker.address, 0n, JOB_TITLE)
      ).to.be.revertedWith("PayAgent: amount must be > 0");
    });
  });

  // ─── Release Payment ──────────────────────────────────────────────────────

  describe("releasePayment", () => {
    beforeEach(async () => {
      await cUSD.connect(employer).approve(await escrow.getAddress(), DEPOSIT_AMOUNT);
      await escrow.connect(employer).depositEscrow(JOB_ID, worker.address, DEPOSIT_AMOUNT, JOB_TITLE);
    });

    it("AI agent releases payment to worker", async () => {
      const fee = (DEPOSIT_AMOUNT * 50n) / 10_000n;
      const net = DEPOSIT_AMOUNT - fee;
      const workerBalanceBefore = await cUSD.balanceOf(worker.address);

      await escrow.connect(aiAgent).releasePayment(JOB_ID);

      expect(await cUSD.balanceOf(worker.address)).to.equal(workerBalanceBefore + net);

      const details = await escrow.getEscrowDetails(JOB_ID);
      expect(details.status).to.equal(2); // Released
    });

    it("emits PaymentReleased event", async () => {
      await expect(
        escrow.connect(aiAgent).releasePayment(JOB_ID)
      ).to.emit(escrow, "PaymentReleased");
    });

    it("rejects non-agent callers", async () => {
      await expect(
        escrow.connect(other).releasePayment(JOB_ID)
      ).to.be.revertedWith("PayAgent: caller is not AI agent");
    });

    it("rejects double release", async () => {
      await escrow.connect(aiAgent).releasePayment(JOB_ID);
      await expect(
        escrow.connect(aiAgent).releasePayment(JOB_ID)
      ).to.be.revertedWith("PayAgent: job not in escrow");
    });
  });

  // ─── Dispute ──────────────────────────────────────────────────────────────

  describe("initiateDispute", () => {
    beforeEach(async () => {
      await cUSD.connect(employer).approve(await escrow.getAddress(), DEPOSIT_AMOUNT);
      await escrow.connect(employer).depositEscrow(JOB_ID, worker.address, DEPOSIT_AMOUNT, JOB_TITLE);
    });

    it("worker can initiate dispute", async () => {
      await escrow.connect(worker).initiateDispute(JOB_ID);
      const details = await escrow.getEscrowDetails(JOB_ID);
      expect(details.status).to.equal(3); // Disputed
    });

    it("employer can initiate dispute", async () => {
      await escrow.connect(employer).initiateDispute(JOB_ID);
      const details = await escrow.getEscrowDetails(JOB_ID);
      expect(details.status).to.equal(3); // Disputed
    });

    it("emits DisputeInitiated event", async () => {
      await expect(
        escrow.connect(worker).initiateDispute(JOB_ID)
      ).to.emit(escrow, "DisputeInitiated").withArgs(JOB_ID, worker.address);
    });

    it("rejects third-party dispute", async () => {
      await expect(
        escrow.connect(other).initiateDispute(JOB_ID)
      ).to.be.revertedWith("PayAgent: only job parties can dispute");
    });
  });

  // ─── Resolve Dispute ──────────────────────────────────────────────────────

  describe("resolveDispute", () => {
    beforeEach(async () => {
      await cUSD.connect(employer).approve(await escrow.getAddress(), DEPOSIT_AMOUNT);
      await escrow.connect(employer).depositEscrow(JOB_ID, worker.address, DEPOSIT_AMOUNT, JOB_TITLE);
      await escrow.connect(worker).initiateDispute(JOB_ID);
    });

    it("owner resolves dispute in worker's favour", async () => {
      const net = DEPOSIT_AMOUNT - (DEPOSIT_AMOUNT * 50n) / 10_000n;
      const workerBefore = await cUSD.balanceOf(worker.address);

      await escrow.connect(owner).resolveDispute(JOB_ID, worker.address);
      expect(await cUSD.balanceOf(worker.address)).to.equal(workerBefore + net);

      const details = await escrow.getEscrowDetails(JOB_ID);
      expect(details.status).to.equal(4); // Resolved
    });

    it("owner resolves dispute in employer's favour", async () => {
      const net = DEPOSIT_AMOUNT - (DEPOSIT_AMOUNT * 50n) / 10_000n;
      const employerBefore = await cUSD.balanceOf(employer.address);

      await escrow.connect(owner).resolveDispute(JOB_ID, employer.address);
      expect(await cUSD.balanceOf(employer.address)).to.equal(employerBefore + net);
    });

    it("rejects non-owner resolver", async () => {
      await expect(
        escrow.connect(other).resolveDispute(JOB_ID, worker.address)
      ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });
  });

  // ─── Refund Expired ───────────────────────────────────────────────────────

  describe("refundExpired", () => {
    beforeEach(async () => {
      await cUSD.connect(employer).approve(await escrow.getAddress(), DEPOSIT_AMOUNT);
      await escrow.connect(employer).depositEscrow(JOB_ID, worker.address, DEPOSIT_AMOUNT, JOB_TITLE);
    });

    it("employer can refund after 30 days", async () => {
      await time.increase(30 * 24 * 60 * 60 + 1);
      const net = DEPOSIT_AMOUNT - (DEPOSIT_AMOUNT * 50n) / 10_000n;
      const employerBefore = await cUSD.balanceOf(employer.address);

      await escrow.connect(employer).refundExpired(JOB_ID);
      expect(await cUSD.balanceOf(employer.address)).to.equal(employerBefore + net);

      const details = await escrow.getEscrowDetails(JOB_ID);
      expect(details.status).to.equal(5); // Refunded
    });

    it("rejects refund before 30 days", async () => {
      await expect(
        escrow.connect(employer).refundExpired(JOB_ID)
      ).to.be.revertedWith("PayAgent: 30-day lock not elapsed");
    });

    it("rejects refund by non-employer", async () => {
      await time.increase(30 * 24 * 60 * 60 + 1);
      await expect(
        escrow.connect(other).refundExpired(JOB_ID)
      ).to.be.revertedWith("PayAgent: only employer can refund");
    });
  });

  // ─── Admin ────────────────────────────────────────────────────────────────

  describe("Admin", () => {
    it("owner can set new AI agent", async () => {
      await escrow.connect(owner).setAIAgent(other.address);
      expect(await escrow.aiAgent()).to.equal(other.address);
    });

    it("owner can update fee (max 5%)", async () => {
      await escrow.connect(owner).setFeeBps(300);
      expect(await escrow.feeBps()).to.equal(300n);
    });

    it("rejects fee > 500 bps", async () => {
      await expect(escrow.connect(owner).setFeeBps(501)).to.be.revertedWith("PayAgent: fee too high");
    });

    it("owner can withdraw collected fees", async () => {
      await cUSD.connect(employer).approve(await escrow.getAddress(), DEPOSIT_AMOUNT);
      await escrow.connect(employer).depositEscrow(JOB_ID, worker.address, DEPOSIT_AMOUNT, JOB_TITLE);

      const fee = (DEPOSIT_AMOUNT * 50n) / 10_000n;
      const ownerBefore = await cUSD.balanceOf(owner.address);

      await escrow.connect(owner).withdrawFees();
      expect(await cUSD.balanceOf(owner.address)).to.equal(ownerBefore + fee);
      expect(await escrow.collectedFees()).to.equal(0n);
    });
  });
});
