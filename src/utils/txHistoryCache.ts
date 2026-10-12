import { redis } from '../config/redis';

/**
 * Drop every cached /transactions/history page for one owner.
 * BOT payments and legacy escrows share the same list, so a new BotTransfer
 * (or a status change) must expire the 2-minute Redis snapshot immediately.
 */
export async function invalidateUserTransactionHistory(userId: unknown): Promise<void> {
  try {
    if (!userId) return;
    const pattern = `tx_history:${String(userId)}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch (error: any) {
    console.error('Failed to invalidate transaction history cache:', error?.message || error);
  }
}
