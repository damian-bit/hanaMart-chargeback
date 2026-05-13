import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/server.js';
import { prisma } from '../../src/lib/prisma.js';

async function truncate() {
  await prisma.fraudPatternDispute.deleteMany();
  await prisma.fraudPattern.deleteMany();
  await prisma.chargeback.deleteMany();
}

const BASE_PAYLOAD = {
  amount: 150,      // USD
  currency: 'USD',
  reasonCodeRaw: '10.4',
  cardholderName: '김민준',
  cardholderEmail: 'kim@example.com',
  shippingAddress: '123 Fraud Street, Gangnam-gu, Seoul',
  orderDate: '2026-01-01T00:00:00Z',
  filingDate: '2026-04-01T00:00:00Z',
  responseDeadline: '2026-05-01T00:00:00Z',
};

describe('fraud patterns integration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await truncate();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    await truncate();
  });

  it('9 same-address POSTs → GET /fraud-patterns has ADDRESS pattern', async () => {
    for (let i = 0; i < 9; i++) {
      await app.inject({
        method: 'POST',
        url: '/chargebacks',
        body: { ...BASE_PAYLOAD, disputeId: `DISP-F-${i}`, transactionId: `TXN-F-${i}` },
      });
    }

    const res = await app.inject({ method: 'GET', url: '/fraud-patterns' });
    expect(res.statusCode).toBe(200);
    const patterns = JSON.parse(res.body);
    expect(patterns.some((p: any) => p.type === 'ADDRESS')).toBe(true);
  });

  it('GET /fraud-patterns/:id returns disputes array', async () => {
    for (let i = 0; i < 9; i++) {
      await app.inject({
        method: 'POST',
        url: '/chargebacks',
        body: { ...BASE_PAYLOAD, disputeId: `DISP-G-${i}`, transactionId: `TXN-G-${i}` },
      });
    }

    const listRes = await app.inject({ method: 'GET', url: '/fraud-patterns' });
    const patterns = JSON.parse(listRes.body);
    const addressPattern = patterns.find((p: any) => p.type === 'ADDRESS');
    expect(addressPattern).toBeDefined();

    const detailRes = await app.inject({ method: 'GET', url: `/fraud-patterns/${addressPattern.id}` });
    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.body);
    expect(Array.isArray(detail.disputes)).toBe(true);
    expect(detail.disputes.length).toBeGreaterThan(0);
    expect(detail.disputes[0]).toHaveProperty('disputeId');
    expect(detail.disputes[0]).toHaveProperty('category');
    expect(detail.disputes[0]).toHaveProperty('amountMinor');
    expect(detail.disputes[0]).toHaveProperty('filingDate');
  });
});
