import { Router, type IRouter } from "express";
import { z } from "zod";
import { releasePayment, initiateDisputeOnChain } from "../lib/celoService.js";

const router: IRouter = Router();

const releaseSchema = z.object({
  jobId: z.string().min(1),
  completionProof: z.string().optional(),
});

const disputeSchema = z.object({
  jobId: z.string().min(1),
  initiatorAddress: z.string().min(42),
  reason: z.string().optional(),
});

router.post("/release", async (req, res) => {
  const parsed = releaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.message });
    return;
  }

  try {
    const result = await releasePayment(parsed.data.jobId, parsed.data.completionProof);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "releasePayment failed");
    res.status(400).json({ error: "Payment release failed", details: String(err) });
  }
});

router.post("/dispute", async (req, res) => {
  const parsed = disputeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.message });
    return;
  }

  try {
    const result = await initiateDisputeOnChain(parsed.data.jobId, parsed.data.initiatorAddress);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "initiateDispute failed");
    res.status(400).json({ error: "Dispute initiation failed", details: String(err) });
  }
});

export default router;
