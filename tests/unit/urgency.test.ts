import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeUrgency } from '../../src/domain/urgency.js';

describe('computeUrgency()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('0 days remaining → critical true', () => {
    const deadline = new Date('2026-01-01T00:00:00Z');
    const { daysRemaining, critical } = computeUrgency(deadline);
    expect(daysRemaining).toBeLessThanOrEqual(0);
    expect(critical).toBe(true);
  });

  it('4 days remaining → critical true', () => {
    const deadline = new Date('2026-01-05T00:00:00Z');
    const { critical } = computeUrgency(deadline);
    expect(critical).toBe(true);
  });

  it('5 days remaining → critical false', () => {
    const deadline = new Date('2026-01-06T00:00:00Z');
    const { critical } = computeUrgency(deadline);
    expect(critical).toBe(false);
  });

  it('10 days remaining → critical false', () => {
    const deadline = new Date('2026-01-11T00:00:00Z');
    const { critical } = computeUrgency(deadline);
    expect(critical).toBe(false);
  });
});
