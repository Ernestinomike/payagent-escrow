import { Router, type IRouter } from "express";
import { getReceipt, getWorkerReceipts } from "../lib/celoService.js";

const router: IRouter = Router();

router.get("/worker/:address", async (req, res) => {
  try {
    const result = await getWorkerReceipts(req.params.address);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "getWorkerReceipts failed");
    res.status(400).json({ error: "Failed to get receipts", details: String(err) });
  }
});

router.get("/:jobId", async (req, res) => {
  try {
    const result = await getReceipt(req.params.jobId);
    if (!result) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "getReceipt failed");
    res.status(400).json({ error: "Failed to get receipt", details: String(err) });
  }
});

export default router;
