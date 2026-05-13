import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runFraudDetection, normalizeAddress } from '../../src/services/fraud-detection.service.js';
import type { Chargeback } from '@prisma/client';

async function truncate() {
  await prisma.fraudPatternDispute.deleteMany();
  await prisma.fraudPattern.deleteMany();
  await prisma.chargeback.deleteMany();
}

function makeCbData(overrides: Partial<Chargeback> = {}) {
  const now = new Date();
  const address = '123 Test Street, Seoul';
  return {
    disputeId: `DISP-${Math.random().toString(36).slice(2)}`,
    transactionId: `TXN-${Math.random().toString(36).slice(2)}`,
    amountMinor: 10000,
    currency: 'USD',
    category: 'FRAUD',
    cardholderName: '김민준',
    cardholderEmail: 'test@example.com',
    emailDomain: 'example.com',
    shippingAddress: address,
    shippingAddressNorm: normalizeAddress(address),
    orderDate: now,
    filingDate: now,
    responseDeadline: new Date(now.getTime() + 15 * 86_400_000),
    status: 'OPEN',
    ...overrides,
  };
}

describe('fraud-detection', () => {
  beforeEach(truncate);
  afterEach(truncate);

  it('9 same-address disputes → ADDRESS detected', async () => {
    const address = '456 Fraud Avenue, Gangnam-gu, Seoul';
    const norm = normalizeAddress(address);
    const cbs = [];
    for (let i = 0; i < 9; i++) {
      const cb = await prisma.chargeback.create({
        data: makeCbData({ shippingAddress: address, shippingAddressNorm: norm }),
      });
      cbs.push(cb);
    }
    const flags = await runFraudDetection(cbs[8]);
    expect(flags.some(f => f.type === 'ADDRESS')).toBe(true);
  });

  it('2 same-address disputes → no ADDRESS detected', async () => {
    const address = '789 Safe Street, Seoul';
    const norm = normalizeAddress(address);
    const cbs = [];
    for (let i = 0; i < 2; i++) {
      const cb = await prisma.chargeback.create({
        data: makeCbData({ shippingAddress: address, shippingAddressNorm: norm }),
      });
      cbs.push(cb);
    }
    const flags = await runFraudDetection(cbs[1]);
    expect(flags.some(f => f.type === 'ADDRESS')).toBe(false);
  });

  it('7 disputes within 48h → TIMING detected', async () => {
    const base = new Date('2026-04-15T12:00:00Z');
    const cbs = [];
    for (let i = 0; i < 7; i++) {
      const filingDate = new Date(base.getTime() + i * 3_600_000); // 1 hour apart
      const cb = await prisma.chargeback.create({
        data: makeCbData({ filingDate, responseDeadline: new Date(filingDate.getTime() + 15 * 86_400_000), orderDate: new Date(filingDate.getTime() - 86_400_000) }),
      });
      cbs.push(cb);
    }
    const flags = await runFraudDetection(cbs[6]);
    expect(flags.some(f => f.type === 'TIMING')).toBe(true);
  });

  it('11 disputes in $50-$54 range → AMOUNT detected', async () => {
    // bucket = floor(amountMinor / 500); $50-$54.99 = bucket 10 (5000-5499)
    const cbs = [];
    for (let i = 0; i < 11; i++) {
      const amountMinor = 5000 + i * 45; // 5000-5450, all in bucket 10
      const cb = await prisma.chargeback.create({
        data: makeCbData({ amountMinor }),
      });
      cbs.push(cb);
    }
    const flags = await runFraudDetection(cbs[10]);
    expect(flags.some(f => f.type === 'AMOUNT')).toBe(true);
  });

  it('4 disputes with same non-common email domain → EMAIL_DOMAIN detected', async () => {
    const domain = 'temp-mail-ko.test';
    const cbs = [];
    for (let i = 0; i < 4; i++) {
      const cb = await prisma.chargeback.create({
        data: makeCbData({ cardholderEmail: `user${i}@${domain}`, emailDomain: domain }),
      });
      cbs.push(cb);
    }
    const flags = await runFraudDetection(cbs[3]);
    expect(flags.some(f => f.type === 'EMAIL_DOMAIN')).toBe(true);
  });

  it('common email domain (gmail.com) → no EMAIL_DOMAIN detected', async () => {
    const domain = 'gmail.com';
    const cbs = [];
    for (let i = 0; i < 4; i++) {
      const cb = await prisma.chargeback.create({
        data: makeCbData({ cardholderEmail: `user${i}@${domain}`, emailDomain: domain }),
      });
      cbs.push(cb);
    }
    const flags = await runFraudDetection(cbs[3]);
    expect(flags.some(f => f.type === 'EMAIL_DOMAIN')).toBe(false);
  });

  it('3 disputes with same IP → IP detected', async () => {
    const ip = '211.234.56.78';
    const cbs = [];
    for (let i = 0; i < 3; i++) {
      const cb = await prisma.chargeback.create({
        data: makeCbData({ ipAddress: ip }),
      });
      cbs.push(cb);
    }
    const flags = await runFraudDetection(cbs[2]);
    expect(flags.some(f => f.type === 'IP')).toBe(true);
  });
});
