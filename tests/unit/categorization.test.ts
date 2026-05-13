import { describe, it, expect } from 'vitest';
import { categorize } from '../../src/services/categorization.service.js';

describe('categorize()', () => {
  it('Visa 10.4 → FRAUD', () => {
    expect(categorize('10.4')).toBe('FRAUD');
  });

  it('Mastercard 4853 → PRODUCT_NOT_RECEIVED', () => {
    expect(categorize('4853')).toBe('PRODUCT_NOT_RECEIVED');
  });

  it('keyword "unauthorized" → FRAUD', () => {
    expect(categorize(null, 'unauthorized transaction')).toBe('FRAUD');
  });

  it('keyword "never received" → PRODUCT_NOT_RECEIVED', () => {
    expect(categorize(null, 'I never received my order')).toBe('PRODUCT_NOT_RECEIVED');
  });

  it('no input → FRAUD', () => {
    expect(categorize()).toBe('FRAUD');
  });

  it('Mastercard 4837 → FRAUD', () => {
    expect(categorize('4837')).toBe('FRAUD');
  });

  it('keyword "duplicate" → DUPLICATE', () => {
    expect(categorize(null, 'duplicate charge')).toBe('DUPLICATE');
  });
});
