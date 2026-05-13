import type { Chargeback } from '@prisma/client';
import { toMajor } from '../domain/money.js';
import { computeUrgency } from '../domain/urgency.js';
import { BASE_SCORE, BASE_LOSS_PCT } from '../domain/risk-weights.js';
import { EVIDENCE_CATALOG, type Category } from '../domain/evidence-catalog.js';

export interface RiskBreakdown {
  factor: string;
  delta: number;
}

export interface RiskResult {
  riskScore: number;
  recommendation: 'FIGHT' | 'ACCEPT';
  breakdown: RiskBreakdown[];
  requiredEvidence: string[];
  daysRemaining: number;
  critical: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface MitigatingOpts {
  hasTrackingNumber?: boolean;
  priorRefundProcessed?: boolean;
  avsMatch?: boolean;
}

export function scoreChargeback(chargeback: Chargeback, history: Chargeback[], opts: MitigatingOpts = {}): RiskResult {
  const category = chargeback.category as Category;
  const breakdown: RiskBreakdown[] = [];

  // 1. Base score
  const base = BASE_SCORE[category];
  breakdown.push({ factor: 'base', delta: base });

  // 2. Amount factor
  const amountUSD = toMajor(chargeback.amountMinor);
  let amountDelta = 0;
  if (amountUSD >= 500) amountDelta = 18;
  else if (amountUSD >= 200) amountDelta = 12;
  else if (amountUSD >= 50) amountDelta = 5;
  if (amountDelta !== 0) breakdown.push({ factor: 'amount', delta: amountDelta });

  // 3. Time pressure
  const { daysRemaining, critical } = computeUrgency(chargeback.responseDeadline);
  let timeDelta = 0;
  if (daysRemaining < 2) timeDelta = 20;
  else if (daysRemaining < 5) timeDelta = 12;
  else if (daysRemaining < 10) timeDelta = 5;
  if (timeDelta !== 0) breakdown.push({ factor: 'time_pressure', delta: timeDelta });

  // 4. Historical adjustment
  let histDelta = 0;
  const closed = history.filter(h => h.status === 'WON' || h.status === 'LOST');
  if (closed.length >= 10) {
    const lost = closed.filter(h => h.status === 'LOST').length;
    const observedLossPct = lost / closed.length;
    const rawAdj = (observedLossPct - BASE_LOSS_PCT[category]) * 0.5 * 100;
    histDelta = Math.round(clamp(rawAdj, -10, 10));
    if (histDelta !== 0) breakdown.push({ factor: 'historical', delta: histDelta });
  }

  // 5. Mitigating factors (explicit flags — visible in breakdown, documentable)
  let mitigateDelta = 0;
  if (category === 'PRODUCT_NOT_RECEIVED' && opts.hasTrackingNumber) {
    mitigateDelta -= 15;
    breakdown.push({ factor: 'mitigating_tracking', delta: -15 });
  }
  if (category === 'CREDIT_NOT_PROCESSED' && opts.priorRefundProcessed) {
    mitigateDelta -= 25;
    breakdown.push({ factor: 'mitigating_refund', delta: -25 });
  }
  if (category === 'FRAUD' && opts.avsMatch) {
    mitigateDelta -= 10;
    breakdown.push({ factor: 'mitigating_avs', delta: -10 });
  }

  // 6. Compute final score
  const raw = base + amountDelta + timeDelta + histDelta + mitigateDelta;
  const riskScore = clamp(raw, 0, 100);

  // 7. Recommendation
  const recommendation: 'FIGHT' | 'ACCEPT' = riskScore > 75 ? 'ACCEPT' : 'FIGHT';

  // 8. Required evidence
  const requiredEvidence = EVIDENCE_CATALOG[category];

  return { riskScore, recommendation, breakdown, requiredEvidence, daysRemaining, critical };
}
