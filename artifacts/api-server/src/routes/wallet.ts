import { Router, type IRouter } from "express";
import { db, walletsTable, transactionsTable, usersTable } from "@workspace/db";
import { eq, desc, sql, gte, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { WithdrawFundsBody, SendTipBody, GetTransactionsQueryParams } from "@workspace/api-zod";
import { getUserSummaries } from "../lib/helpers";
import { getTxFeeRate } from "../lib/fees";
import { walletLimiter } from "../middlewares/rateLimiter";
import { sendTipReceivedEmail } from "../lib/email";

const router: IRouter = Router();

router.get("/wallet", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
  if (!wallet) {
    [wallet] = await db.insert(walletsTable).values({ userId }).returning();
  }
  res.json({ ...wallet, balance: Number(wallet.balance), totalEarned: Number(wallet.totalEarned), totalSpent: Number(wallet.totalSpent) });
});

router.get("/wallet/transactions", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const parsed = GetTransactionsQueryParams.safeParse(req.query);
  const { limit = 20, offset = 0 } = parsed.success ? parsed.data : {};

  const txs = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit).offset(offset);

  const relatedUserIds = txs.filter(t => t.relatedUserId).map(t => t.relatedUserId!);
  const summaries = await getUserSummaries(relatedUserIds);

  res.json(txs.map(t => ({
    ...t,
    amount: Number(t.amount),
    fee: Number(t.fee),
    relatedUser: t.relatedUserId ? summaries[t.relatedUserId] ?? null : null,
  })));
});

router.post("/wallet/deposit", requireAuth, walletLimiter, async (req, res) => {
  res.status(503).json({ error: "Deposits are not available yet. Payment processing is coming soon." });
});

router.post("/wallet/withdraw", requireAuth, walletLimiter, async (req, res) => {
  const userId = (req as any).user.id;
  const parsed = WithdrawFundsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { amount } = parsed.data;
  const feeRate = getTxFeeRate((req as any).user.accountTier);
  const fee = Number((amount * feeRate).toFixed(2));
  const netAmount = Number((amount - fee).toFixed(2));

  let wallet: typeof walletsTable.$inferSelect;
  try {
    wallet = await db.transaction(async (tx) => {
      // Atomic check-and-deduct: WHERE clause ensures balance >= amount at the moment of update
      const [w] = await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} - ${amount}`,
          totalSpent: sql`${walletsTable.totalSpent} + ${amount}`,
        })
        .where(and(eq(walletsTable.userId, userId), gte(walletsTable.balance, String(amount))))
        .returning();

      if (!w) {
        const err = new Error("Insufficient balance") as any;
        err.code = "INSUFFICIENT_BALANCE";
        throw err;
      }

      await tx.insert(transactionsTable).values({
        userId,
        type: "withdrawal",
        amount: String(netAmount),
        fee: String(fee),
        status: "completed",
        description: "Wallet withdrawal",
      });

      return w;
    });
  } catch (e: any) {
    if (e.code === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    throw e;
  }

  res.json({ ...wallet, balance: Number(wallet.balance), totalEarned: Number(wallet.totalEarned), totalSpent: Number(wallet.totalSpent) });
});

router.post("/tips", requireAuth, walletLimiter, async (req, res) => {
  const senderId = (req as any).user.id;
  const parsed = SendTipBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { recipientId, amount, message } = parsed.data;

  if (recipientId === senderId) { res.status(400).json({ error: "Cannot tip yourself" }); return; }

  // Fee rate is based on the recipient (creator) tier — higher tier = lower fee = more earnings
  const [recipient] = await db.select({ accountTier: usersTable.accountTier })
    .from(usersTable).where(eq(usersTable.id, recipientId)).limit(1);
  const feeRate = getTxFeeRate(recipient?.accountTier);
  const fee = Number((amount * feeRate).toFixed(2));
  const netAmount = Number((amount - fee).toFixed(2));

  let txRecord: typeof transactionsTable.$inferSelect;
  try {
    txRecord = await db.transaction(async (tx) => {
      // Atomic check-and-deduct from sender
      const [senderWallet] = await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} - ${amount}`,
          totalSpent: sql`${walletsTable.totalSpent} + ${amount}`,
        })
        .where(and(eq(walletsTable.userId, senderId), gte(walletsTable.balance, String(amount))))
        .returning();

      if (!senderWallet) {
        const err = new Error("Insufficient balance") as any;
        err.code = "INSUFFICIENT_BALANCE";
        throw err;
      }

      // Credit recipient
      await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} + ${netAmount}`,
          totalEarned: sql`${walletsTable.totalEarned} + ${netAmount}`,
        })
        .where(eq(walletsTable.userId, recipientId));

      // Record transaction
      const [t] = await tx.insert(transactionsTable).values({
        userId: senderId,
        type: "tip",
        amount: String(amount),
        fee: String(fee),
        status: "completed",
        description: message ?? "Creator tip",
        relatedUserId: recipientId,
      }).returning();

      return t;
    });
  } catch (e: any) {
    if (e.code === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    throw e;
  }

  const summaries = await getUserSummaries([recipientId]);

  // Email notification (fire-and-forget, outside transaction)
  const sender = (req as any).user;
  const [recipientEmail] = await db.select({ email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, recipientId)).limit(1);
  if (recipientEmail) {
    sendTipReceivedEmail(
      recipientEmail.email,
      sender.displayName ?? sender.username,
      sender.username,
      netAmount,
      message,
    );
  }

  res.json({ ...txRecord, amount: Number(txRecord.amount), fee: Number(txRecord.fee), relatedUser: summaries[recipientId] ?? null });
});

export default router;
