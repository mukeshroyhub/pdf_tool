import { prisma } from "../lib/prisma";

/**
 * Privacy-preserving usage analytics.
 *
 * Records ONLY aggregate counts — a number per (day, metric). No user id, no
 * IP address, no file name, no session, nothing that could identify a person
 * or a document. "127 guests today, 340 pdf operations this week" is the most
 * granular this can ever be, by construction. Consistent with the app's core
 * promise that the server keeps nothing about individual users or their files.
 */

export type Metric = "guest" | "signup" | "login" | "pdf_op";

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/** Increments a daily counter. Fire-and-forget: never blocks or breaks a request. */
export function bump(metric: Metric): void {
  const date = today();
  void prisma.dailyStat
    .upsert({
      where: { date_metric: { date, metric } },
      create: { date, metric, count: 1 },
      update: { count: { increment: 1 } },
    })
    .catch(() => undefined);
}

export interface StatsSummary {
  totals: Record<string, number>;
  today: Record<string, number>;
  days: Array<{ date: string; metrics: Record<string, number> }>;
}

/** Returns the last `days` days of counters, plus running totals. */
export async function summary(days = 30): Promise<StatsSummary> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await prisma.dailyStat.findMany({
    where: { date: { gte: since } },
    orderBy: { date: "desc" },
  });
  const allTotals = await prisma.dailyStat.groupBy({
    by: ["metric"],
    _sum: { count: true },
  });

  const totals: Record<string, number> = {};
  for (const t of allTotals) totals[t.metric] = t._sum.count ?? 0;

  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const day = byDay.get(r.date) ?? {};
    day[r.metric] = r.count;
    byDay.set(r.date, day);
  }
  const todayStr = today();
  return {
    totals,
    today: byDay.get(todayStr) ?? {},
    days: [...byDay.entries()].map(([date, metrics]) => ({ date, metrics })),
  };
}
