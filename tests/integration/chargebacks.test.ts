import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/server.js';
import { prisma } from '../../src/lib/prisma.js';

async function truncate() {
  await prisma.fraudPatternDispute.deleteMany();
  await prisma.fraudPattern.deleteMany();
  await prisma.chargeback.deleteMany();
}

const validPayload = {
  disputeId: 'DISP-INT-001',
  transactionId: 'TXN-INT-001',
  amount: 150,      // USD — stored internally as amountMinor: 15000
  currency: 'USD',
  reasonCodeRaw: '10.4',
  cardholderName: '김민준',
  cardholderEmail: 'kim@example.com',
  shippingAddress: '서울특별시 강남구 테헤란로 152',
  orderDate: '2026-01-01T00:00:00Z',
  filingDate: '2026-01-15T00:00:00Z',
  responseDeadline: '2026-02-15T00:00:00Z',
};

describe('chargebacks integration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await truncate();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    await truncate();
  });

  it('valid POST → 201 with expected fields', async () => {
    const res = await app.inject({ method: 'POST', url: '/chargebacks', body: validPayload });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.category).toBe('FRAUD');
    expect(typeof body.critical).toBe('boolean');
    expect(typeof body.riskScore).toBe('number');
    expect(['FIGHT', 'ACCEPT']).toContain(body.recommendation);
    expect(Array.isArray(body.fraudFlags)).toBe(true);
  });

  it('duplicate transactionId → 409', async () => {
    await app.inject({ method: 'POST', url: '/chargebacks', body: validPayload });
    const res = await app.inject({ method: 'POST', url: '/chargebacks', body: { ...validPayload, disputeId: 'DISP-INT-002' } });
    expect(res.statusCode).toBe(409);
  });

  it('invalid payload → 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/chargebacks', body: { disputeId: 'test' } });
    expect(res.statusCode).toBe(400);
  });

  it('GET /chargebacks → array', async () => {
    await app.inject({ method: 'POST', url: '/chargebacks', body: validPayload });
    const res = await app.inject({ method: 'GET', url: '/chargebacks' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('GET /chargebacks/:id → has critical and daysRemaining', async () => {
    const post = await app.inject({ method: 'POST', url: '/chargebacks', body: validPayload });
    const { id } = JSON.parse(post.body);
    const res = await app.inject({ method: 'GET', url: `/chargebacks/${id}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.critical).toBe('boolean');
    expect(typeof body.daysRemaining).toBe('number');
  });

  it('GET /chargebacks/nonexistent → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/chargebacks/nonexistent-id' });
    expect(res.statusCode).toBe(404);
  });
});
