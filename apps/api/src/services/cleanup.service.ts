import { prisma } from "../lib/prisma";
import * as storage from "../lib/storage";

/** How long uploaded files and activity entries are kept. */
export const DATA_RETENTION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Retention cleanup: deletes files and activity older than the retention
 * window. For files it removes the bytes from storage, deletes the row, and
 * restores the owner's storage quota. Runs on a schedule from index.ts.
 */
export async function purgeExpiredData(): Promise<void> {
  const cutoff = new Date(Date.now() - DATA_RETENTION_MS);

  const oldFiles = await prisma.file.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, userId: true, storageKey: true, sizeBytes: true },
  });

  if (oldFiles.length > 0) {
    // Remove the bytes from object storage (best-effort).
    await Promise.all(oldFiles.map((f) => storage.remove(f.storageKey).catch(() => undefined)));

    // Sum freed bytes per user to restore quota.
    const freedByUser = new Map<string, bigint>();
    for (const f of oldFiles) {
      freedByUser.set(f.userId, (freedByUser.get(f.userId) ?? BigInt(0)) + f.sizeBytes);
    }

    await prisma.file.deleteMany({ where: { id: { in: oldFiles.map((f) => f.id) } } });

    for (const [userId, freed] of freedByUser) {
      // The user may already be gone (e.g. guest cleanup) — ignore if so.
      await prisma.user
        .update({ where: { id: userId }, data: { storageUsed: { decrement: freed } } })
        .catch(() => undefined);
    }
  }

  // Purge old activity entries.
  await prisma.activity.deleteMany({ where: { createdAt: { lt: cutoff } } });
}
