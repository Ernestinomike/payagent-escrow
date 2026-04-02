// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  PayAgentEscrow
 * @author PayAgent Team
 * @notice Autonomous escrow contract for AI-powered gig worker payments on Celo.
 *         Employers deposit cUSD, the AI agent releases payment when job is complete.
 *         Supports dispute resolution by contract owner (admin arbitration).
 */
contract PayAgentEscrow is ReentrancyGuard, Ownable {

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Celo's cUSD stablecoin token contract
    IERC20 public immutable cUSD;

    /// @notice Address of the AI agent wallet authorized to release payments
    address public aiAgent;

    /// @notice Platform fee in basis points (50 = 0.5%)
    uint256 public feeBps = 50;

    /// @notice Accumulated platform fees claimable by owner
    uint256 public collectedFees;

    // ─── Enums & Structs ──────────────────────────────────────────────────────

    enum Status { None, Escrowed, Released, Disputed, Resolved, Refunded }

    struct Escrow {
        address employer;
        address worker;
        uint256 amount;
        uint256 fee;
        Status  status;
        uint256 createdAt;
        string  jobTitle;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    /// @notice jobId => Escrow details
    mapping(bytes32 => Escrow) public escrows;

    /// @notice Track all job IDs for a worker address
    mapping(address => bytes32[]) public workerJobs;

    /// @notice Track all job IDs for an employer address
    mapping(address => bytes32[]) public employerJobs;

    // ─── Events ───────────────────────────────────────────────────────────────

    event PaymentEscrowed(
        bytes32 indexed jobId,
        address indexed employer,
        address indexed worker,
        uint256 amount,
        uint256 fee,
        string  jobTitle
    );

    event PaymentReleased(
        bytes32 indexed jobId,
        address indexed worker,
        uint256 amount
    );

    event DisputeInitiated(
        bytes32 indexed jobId,
        address indexed initiator
    );

    event DisputeResolved(
        bytes32 indexed jobId,
        address indexed winner,
        uint256 amount
    );

    event PaymentRefunded(
        bytes32 indexed jobId,
        address indexed employer,
        uint256 amount
    );

    event AIAgentUpdated(address indexed oldAgent, address indexed newAgent);
    event FeeBpsUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAIAgent() {
        require(msg.sender == aiAgent, "PayAgent: caller is not AI agent");
        _;
    }

    modifier jobExists(bytes32 jobId) {
        require(escrows[jobId].status != Status.None, "PayAgent: job does not exist");
        _;
    }

    modifier onlyEscrowed(bytes32 jobId) {
        require(escrows[jobId].status == Status.Escrowed, "PayAgent: job not in escrow");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _cUSD    Address of the cUSD token on Celo
     * @param _aiAgent Address of the PayAgent AI wallet
     */
    constructor(address _cUSD, address _aiAgent) Ownable(msg.sender) {
        require(_cUSD    != address(0), "PayAgent: invalid cUSD address");
        require(_aiAgent != address(0), "PayAgent: invalid agent address");
        cUSD    = IERC20(_cUSD);
        aiAgent = _aiAgent;
    }

    // ─── Core Functions ───────────────────────────────────────────────────────

    /**
     * @notice Employer locks cUSD into escrow for a specific job.
     * @param  jobId    Unique identifier for the job (keccak256 hash recommended)
     * @param  worker   Wallet address of the gig worker
     * @param  amount   Total cUSD amount to escrow (gross, before fee deduction)
     * @param  jobTitle Human-readable job title for invoice generation
     */
    function depositEscrow(
        bytes32 jobId,
        address worker,
        uint256 amount,
        string  calldata jobTitle
    ) external {
        require(escrows[jobId].status == Status.None,   "PayAgent: job ID already used");
        require(worker  != address(0),                  "PayAgent: invalid worker address");
        require(worker  != msg.sender,                  "PayAgent: employer cannot be worker");
        require(amount  > 0,                            "PayAgent: amount must be > 0");
        require(bytes(jobTitle).length > 0,             "PayAgent: job title required");

        // Calculate platform fee
        uint256 fee        = (amount * feeBps) / 10_000;
        uint256 netAmount  = amount - fee;

        // Pull tokens from employer
        cUSD.transferFrom(msg.sender, address(this), amount);

        // Record escrow
        escrows[jobId] = Escrow({
            employer:  msg.sender,
            worker:    worker,
            amount:    netAmount,
            fee:       fee,
            status:    Status.Escrowed,
            createdAt: block.timestamp,
            jobTitle:  jobTitle
        });

        workerJobs[worker].push(jobId);
        employerJobs[msg.sender].push(jobId);

        collectedFees += fee;

        emit PaymentEscrowed(jobId, msg.sender, worker, netAmount, fee, jobTitle);
    }

    /**
     * @notice AI agent releases escrowed payment to worker after verifying job completion.
     * @dev    Only callable by the authorized AI agent wallet. Re-entrancy protected.
     * @param  jobId  The job identifier to release payment for
     */
    function releasePayment(bytes32 jobId)
        external
        nonReentrant
        onlyAIAgent
        jobExists(jobId)
        onlyEscrowed(jobId)
    {
        Escrow storage e = escrows[jobId];
        e.status = Status.Released;

        cUSD.transfer(e.worker, e.amount);

        emit PaymentReleased(jobId, e.worker, e.amount);
    }

    /**
     * @notice Worker or employer initiates a dispute for a job.
     * @param  jobId  The job identifier to dispute
     */
    function initiateDispute(bytes32 jobId)
        external
        jobExists(jobId)
        onlyEscrowed(jobId)
    {
        Escrow storage e = escrows[jobId];
        require(
            msg.sender == e.worker || msg.sender == e.employer,
            "PayAgent: only job parties can dispute"
        );

        e.status = Status.Disputed;
        emit DisputeInitiated(jobId, msg.sender);
    }

    /**
     * @notice Owner resolves a dispute, sending funds to the winner.
     * @param  jobId   The disputed job identifier
     * @param  winner  Address of the winning party (worker or employer)
     */
    function resolveDispute(bytes32 jobId, address winner)
        external
        nonReentrant
        onlyOwner
        jobExists(jobId)
    {
        Escrow storage e = escrows[jobId];
        require(e.status == Status.Disputed, "PayAgent: job not disputed");
        require(
            winner == e.worker || winner == e.employer,
            "PayAgent: winner must be a job party"
        );

        e.status = Status.Resolved;
        cUSD.transfer(winner, e.amount);

        emit DisputeResolved(jobId, winner, e.amount);
    }

    /**
     * @notice Employer can reclaim funds if worker is unresponsive (after 30 days).
     * @param  jobId  The job identifier to refund
     */
    function refundExpired(bytes32 jobId)
        external
        nonReentrant
        jobExists(jobId)
        onlyEscrowed(jobId)
    {
        Escrow storage e = escrows[jobId];
        require(msg.sender == e.employer,              "PayAgent: only employer can refund");
        require(block.timestamp >= e.createdAt + 30 days, "PayAgent: 30-day lock not elapsed");

        e.status = Status.Refunded;
        cUSD.transfer(e.employer, e.amount);

        emit PaymentRefunded(jobId, e.employer, e.amount);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /// @notice Returns full escrow details for a job
    function getEscrowDetails(bytes32 jobId)
        external
        view
        returns (Escrow memory)
    {
        return escrows[jobId];
    }

    /// @notice Returns all job IDs for a worker
    function getWorkerJobs(address worker)
        external
        view
        returns (bytes32[] memory)
    {
        return workerJobs[worker];
    }

    /// @notice Returns all job IDs for an employer
    function getEmployerJobs(address employer)
        external
        view
        returns (bytes32[] memory)
    {
        return employerJobs[employer];
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    /// @notice Update the AI agent wallet address
    function setAIAgent(address newAgent) external onlyOwner {
        require(newAgent != address(0), "PayAgent: invalid address");
        emit AIAgentUpdated(aiAgent, newAgent);
        aiAgent = newAgent;
    }

    /// @notice Update platform fee (max 5% = 500 bps)
    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 500, "PayAgent: fee too high");
        emit FeeBpsUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    /// @notice Withdraw accumulated platform fees to owner
    function withdrawFees() external nonReentrant onlyOwner {
        uint256 amount = collectedFees;
        require(amount > 0, "PayAgent: no fees to withdraw");
        collectedFees = 0;
        cUSD.transfer(owner(), amount);
        emit FeesWithdrawn(owner(), amount);
    }

    /// @notice Emergency: recover any ERC-20 tokens accidentally sent to contract
    function recoverToken(address token, uint256 amount) external onlyOwner {
        require(token != address(cUSD), "PayAgent: cannot recover cUSD");
        IERC20(token).transfer(owner(), amount);
    }
}
