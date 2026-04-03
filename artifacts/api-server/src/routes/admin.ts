import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  deployContract,
  getContractStatus,
  getTransactionLog,
} from "../lib/celoService.js";

const router: IRouter = Router();

const deploySchema = z.object({
  network: z.enum(["celo", "alfajores", "celoSepolia"]),
  cUSDAddress: z.string().optional(),
});

const txLogSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

router.post("/deploy", async (req, res) => {
  const parsed = deploySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.message });
    return;
  }

  try {
    const result = await deployContract(parsed.data.network, parsed.data.cUSDAddress);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "deployContract failed");
    res.status(400).json({ error: "Deployment failed", details: String(err) });
  }
});

router.get("/status", async (req, res) => {
  try {
    const result = await getContractStatus();
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "getContractStatus failed");
    res.status(400).json({ error: "Failed to get contract status", details: String(err) });
  }
});

router.get("/transactions", async (req, res) => {
  const parsed = txLogSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params", details: parsed.error.message });
    return;
  }

  try {
    const result = await getTransactionLog(parsed.data.limit, parsed.data.offset);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "getTransactionLog failed");
    res.status(400).json({ error: "Failed to get transactions", details: String(err) });
  }
});

export default router;
