import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import escrowRouter from "./escrow.js";
import paymentsRouter from "./payments.js";
import receiptsRouter from "./receipts.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/escrow", escrowRouter);
router.use("/payments", paymentsRouter);
router.use("/receipts", receiptsRouter);
router.use("/admin", adminRouter);

export default router;
