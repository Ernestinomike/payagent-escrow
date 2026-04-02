import { pgTable, text, serial, integer, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  jobId: text("job_id"),
  txHash: text("tx_hash").notNull(),
  from: text("from_address"),
  to: text("to_address"),
  amount: text("amount"),
  status: text("status").notNull().default("pending"),
  blockNumber: integer("block_number"),
  network: text("network").notNull().default("alfajores"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;

export const contractDeploymentTable = pgTable("contract_deployment", {
  id: serial("id").primaryKey(),
  contractAddress: text("contract_address").notNull(),
  txHash: text("tx_hash").notNull(),
  network: text("network").notNull(),
  deployerAddress: text("deployer_address").notNull(),
  aiAgentAddress: text("ai_agent_address").notNull(),
  cUSDAddress: text("cusd_address").notNull(),
  blockNumber: integer("block_number"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const insertDeploymentSchema = createInsertSchema(contractDeploymentTable).omit({ id: true });
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type ContractDeployment = typeof contractDeploymentTable.$inferSelect;

export const receiptsTable = pgTable("receipts", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull().unique(),
  jobTitle: text("job_title").notNull(),
  worker: text("worker").notNull(),
  employer: text("employer").notNull(),
  amount: text("amount").notNull(),
  txHash: text("tx_hash").notNull(),
  blockNumber: integer("block_number"),
  network: text("network").notNull(),
  contractAddress: text("contract_address").notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  status: text("status").notNull(),
});

export const insertReceiptSchema = createInsertSchema(receiptsTable).omit({ id: true });
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receiptsTable.$inferSelect;
