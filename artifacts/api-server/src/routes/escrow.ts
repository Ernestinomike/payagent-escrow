import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  depositEscrow,
  getEscrowDetails,
  getWorkerJobs,
  getEmployerJobs,
} from "../lib/celoService.js";

const router: IRouter = Router();

const depositSchema = z.object({
  jobId: z.string().min(1),
  workerAddress: z.string().min(42),
  amount: z.string().min(1),
  jobTitle: z.string().min(1),
});

router.post("/deposit", async (req, res) => {
  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.message });
    return;
  }

  try {
    const result = await depositEscrow(
      parsed.data.jobId,
      parsed.data.workerAddress,
      parsed.data.amount,
      parsed.data.jobTitle,
    );
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "depositEscrow failed");
    res.status(400).json({ error: "Deposit failed", details: String(err) });
  }
});

router.get("/worker/:address", async (req, res) => {
  try {
    const result = await getWorkerJobs(req.params.address);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "getWorkerJobs failed");
    res.status(400).json({ error: "Failed to get worker jobs", details: String(err) });
  }
});

router.get("/employer/:address", async (req, res) => {
  try {
    const result = await getEmployerJobs(req.params.address);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "getEmployerJobs failed");
    res.status(400).json({ error: "Failed to get employer jobs", details: String(err) });
  }
});

router.get("/:jobId", async (req, res) => {
  try {
    const result = await getEscrowDetails(req.params.jobId);
    if (result.status === "None") {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "getEscrowDetails failed");
    res.status(400).json({ error: "Failed to get escrow details", details: String(err) });
  }
});

export default router;
