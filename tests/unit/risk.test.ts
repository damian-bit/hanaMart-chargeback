import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scoreChargeback } from '../../src/services/risk.service.js';
import type { Chargeback } from '@prisma/client';

function makeChargeback(overrides: Partial<Chargeback> = {}): Chargeback {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'test-id',
    disputeId: 'DISP-001',
    transactionId: 'TXN-001',
    amountMinor: 3000,
    currency: 'USD',
    reasonCodeRaw: null,
    reasonText: null,
    category: 'FRAUD',
    cardholderName: 'Test User',
    cardholderEmail: 'test@example.com',
    emailDomain: 'example.com',
    shippingAddress: '123 Test St',
    shippingAddressNorm: '123 test st',
    ipAddress: null,
    orderDate: now,
    filingDate: now,
    responseDeadline: new Date(now.getTime() + 10 * 86_400_000),
    status: 'OPEN',
    respondedAt: null,
    riskScore: null,
    recommendation: null,
    createdAt: now,
    ...overrides,
  };
}

describe('scoreChargeback()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('DUPLICATE $30 10 days → score ≤ 20 and FIGHT', () => {
    const cb = makeChargeback({
      category: 'DUPLICATE',
      amountMinor: 3000, // $30
      responseDeadline: new Date('2026-01-11T00:00:00Z'), // 10 days
    });
    const result = scoreChargeback(cb, []);
    expect(result.riskScore).toBeLessThanOrEqual(20);
    expect(result.recommendation).toBe('FIGHT');
  });

  it('FRAUD $400 1 day → score > 75 and ACCEPT', () => {
    const cb = makeChargeback({
      category: 'FRAUD',
      amountMinor: 40000, // $400
      responseDeadline: new Date('2026-01-02T00:00:00Z'), // 1 day
    });
    const result = scoreChargeback(cb, []);
    expect(result.riskScore).toBeGreaterThan(75);
    expect(result.recommendation).toBe('ACCEPT');
  });

  it('score is always 0-100', () => {
    const cases = [
      makeChargeback({ category: 'FRAUD', amountMinor: 1000000, responseDeadline: new Date('2026-01-01T00:00:01Z') }),
      makeChargeback({ category: 'DUPLICATE', amountMinor: 1, responseDeadline: new Date('2026-12-31T00:00:00Z') }),
    ];
    for (const cb of cases) {
      const { riskScore } = scoreChargeback(cb, []);
      expect(riskScore).toBeGreaterThanOrEqual(0);
      expect(riskScore).toBeLessThanOrEqual(100);
    }
  });

  it('hasTrackingNumber → -15 delta for PRODUCT_NOT_RECEIVED', () => {
    const cb = makeChargeback({
      category: 'PRODUCT_NOT_RECEIVED',
      amountMinor: 3000,
      responseDeadline: new Date('2026-01-11T00:00:00Z'),
    });
    const without = scoreChargeback(cb, []);
    const with_ = scoreChargeback(cb, [], { hasTrackingNumber: true });
    expect(with_.riskScore).toBe(Math.max(0, without.riskScore - 15));
    expect(with_.breakdown.some(b => b.factor === 'mitigating_tracking')).toBe(true);
  });

  it('priorRefundProcessed → -25 delta for CREDIT_NOT_PROCESSED', () => {
    const cb = makeChargeback({
      category: 'CREDIT_NOT_PROCESSED',
      amountMinor: 3000,
      responseDeadline: new Date('2026-01-11T00:00:00Z'),
    });
    const without = scoreChargeback(cb, []);
    const with_ = scoreChargeback(cb, [], { priorRefundProcessed: true });
    expect(with_.riskScore).toBe(Math.max(0, without.riskScore - 25));
    expect(with_.breakdown.some(b => b.factor === 'mitigating_refund')).toBe(true);
  });

  it('avsMatch → -10 delta for FRAUD', () => {
    const cb = makeChargeback({
      category: 'FRAUD',
      amountMinor: 3000,
      responseDeadline: new Date('2026-01-11T00:00:00Z'),
    });
    const without = scoreChargeback(cb, []);
    const with_ = scoreChargeback(cb, [], { avsMatch: true });
    expect(with_.riskScore).toBe(Math.max(0, without.riskScore - 10));
    expect(with_.breakdown.some(b => b.factor === 'mitigating_avs')).toBe(true);
  });

  it('mitigating flags ignored for wrong category', () => {
    const cb = makeChargeback({ category: 'FRAUD', amountMinor: 3000, responseDeadline: new Date('2026-01-11T00:00:00Z') });
    const without = scoreChargeback(cb, []);
    const with_ = scoreChargeback(cb, [], { hasTrackingNumber: true }); // tracking doesn't apply to FRAUD
    expect(with_.riskScore).toBe(without.riskScore);
  });

  it('breakdown deltas sum to riskScore (before clamp doesn\'t matter, but within range)', () => {
    const cb = makeChargeback({ category: 'FRAUD', amountMinor: 20000, responseDeadline: new Date('2026-01-06T00:00:00Z') });
    const { riskScore, breakdown } = scoreChargeback(cb, []);
    const sum = breakdown.reduce((s, b) => s + b.delta, 0);
    // If sum is within 0-100, it equals riskScore; otherwise riskScore is clamped
    if (sum >= 0 && sum <= 100) {
      expect(riskScore).toBe(sum);
    } else {
      expect(riskScore).toBe(Math.max(0, Math.min(100, sum)));
    }
  });
});
