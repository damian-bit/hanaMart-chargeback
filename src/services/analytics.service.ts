import { prisma } from '../lib/prisma.js';
import { toMajor } from '../domain/money.js';

export async function getSummary(month: string) {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 1);

  const chargebacks = await prisma.chargeback.findMany({
    where: { filingDate: { gte: start, lt: end } },
    select: { status: true, amountMinor: true },
  });

  const total = chargebacks.length;
  const totalAmountUSD = toMajor(chargebacks.reduce((sum, c) => sum + c.amountMinor, 0));
  const byStatus = { OPEN: 0, RESPONDED: 0, WON: 0, LOST: 0 };
  for (const c of chargebacks) {
    const s = c.status as keyof typeof byStatus;
    if (s in byStatus) byStatus[s]++;
  }

  return { month, total, totalAmountUSD, byStatus };
}

export async function getWinRateByCategory() {
  const chargebacks = await prisma.chargeback.findMany({
    where: { status: { in: ['WON', 'LOST'] } },
    select: { category: true, status: true },
  });

  const map = new Map<string, { won: number; lost: number }>();
  for (const c of chargebacks) {
    if (!map.has(c.category)) map.set(c.category, { won: 0, lost: 0 });
    const entry = map.get(c.category)!;
    if (c.status === 'WON') entry.won++;
    else entry.lost++;
  }

  return Array.from(map.entries()).map(([category, { won, lost }]) => ({
    category,
    total: won + lost,
    won,
    lost,
    winRate: won + lost > 0 ? won / (won + lost) : 0,
  }));
}

export async function getAvgResponseTime() {
  const chargebacks = await prisma.chargeback.findMany({
    where: { respondedAt: { not: null }, status: { in: ['RESPONDED', 'WON', 'LOST'] } },
    select: { filingDate: true, respondedAt: true },
  });

  if (chargebacks.length === 0) return { avgDays: null, count: 0 };

  const totalDays = chargebacks.reduce((sum, c) => {
    const diff = (c.respondedAt!.getTime() - c.filingDate.getTime()) / 86_400_000;
    return sum + diff;
  }, 0);

  return { avgDays: totalDays / chargebacks.length, count: chargebacks.length };
}

export async function getTopFraudPatterns(limit: number) {
  return prisma.fraudPattern.findMany({
    orderBy: { disputeCount: 'desc' },
    take: limit,
  });
}
