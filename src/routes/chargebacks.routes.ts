import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { categorize } from '../services/categorization.service.js';
import { scoreChargeback } from '../services/risk.service.js';
import { runFraudDetection, normalizeAddress } from '../services/fraud-detection.service.js';
import { computeUrgency } from '../domain/urgency.js';
import { toMinor } from '../domain/money.js';

const CreateChargebackSchema = z.object({
  disputeId: z.string(),
  transactionId: z.string(),
  amount: z.number().positive(),           // USD float — converted to cents internally
  currency: z.string().default('USD'),
  reasonCodeRaw: z.string().optional(),
  reasonText: z.string().optional(),
  cardholderName: z.string(),
  cardholderEmail: z.string().email(),
  shippingAddress: z.string(),
  ipAddress: z.string().optional(),
  orderDate: z.coerce.date(),
  filingDate: z.coerce.date(),
  responseDeadline: z.coerce.date(),
  hasTrackingNumber: z.boolean().optional(),    // activates -15 for PRODUCT_NOT_RECEIVED
  priorRefundProcessed: z.boolean().optional(), // activates -25 for CREDIT_NOT_PROCESSED
  avsMatch: z.boolean().optional(),             // activates -10 for FRAUD
});

const ListQuerySchema = z.object({
  category: z.string().optional(),
  status: z.string().optional(),
  critical: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const chargebackBodySchema = {
  type: 'object',
  required: ['disputeId', 'transactionId', 'amount', 'cardholderName', 'cardholderEmail', 'shippingAddress', 'orderDate', 'filingDate', 'responseDeadline'],
  properties: {
    disputeId: { type: 'string', description: 'Unique dispute ID from the acquiring bank. Example: CB-2026-00123' },
    transactionId: { type: 'string', description: 'Original transaction ID being disputed. Example: TXN-987654' },
    amount: { type: 'number', minimum: 0.01, description: 'Disputed amount in USD. Example: 149.99' },
    currency: { type: 'string', default: 'USD', description: 'Currency code. Default: USD' },
    reasonCodeRaw: { type: 'string', description: 'Raw network reason code (optional). Example: 4853 (Visa not as described)' },
    reasonText: { type: 'string', description: 'Free-text description of the dispute reason (optional).' },
    cardholderName: { type: 'string', description: 'Full name of the cardholder. Example: Kim Ji-woo' },
    cardholderEmail: { type: 'string', format: 'email', description: 'Cardholder email address.' },
    shippingAddress: { type: 'string', description: 'Shipping address for the disputed order.' },
    ipAddress: { type: 'string', description: 'IP address of the original transaction (optional, used for fraud detection).' },
    orderDate: { type: 'string', format: 'date-time', description: 'When the original order was placed. Example: 2026-04-01T10:00:00Z' },
    filingDate: { type: 'string', format: 'date-time', description: 'When the chargeback was filed by the cardholder. Example: 2026-04-10T00:00:00Z' },
    responseDeadline: { type: 'string', format: 'date-time', description: 'Deadline to submit a response (7–21 days from filing). Example: 2026-04-24T00:00:00Z' },
    hasTrackingNumber: { type: 'boolean', description: 'Whether a shipping tracking number exists. Reduces risk score for PRODUCT_NOT_RECEIVED disputes.' },
    priorRefundProcessed: { type: 'boolean', description: 'Whether a refund was already issued. Reduces risk score for CREDIT_NOT_PROCESSED disputes.' },
    avsMatch: { type: 'boolean', description: 'Whether AVS (Address Verification System) matched. Reduces risk score for FRAUD disputes.' },
  },
};

export default async function chargebackRoutes(app: FastifyInstance) {
  // POST /chargebacks
  app.post('/chargebacks', {
    schema: {
      description: 'Ingests a new chargeback dispute. Automatically categorizes the dispute reason into one of 6 categories, calculates urgency (days remaining to respond, flagging <5 days as critical), computes a 0–100 risk score, recommends evidence items to gather, and runs fraud pattern detection across all signals.',
      tags: ['Chargebacks'],
      body: chargebackBodySchema,
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            disputeId: { type: 'string' },
            transactionId: { type: 'string' },
            category: { type: 'string', description: 'FRAUD | PRODUCT_NOT_RECEIVED | NOT_AS_DESCRIBED | DUPLICATE | CREDIT_NOT_PROCESSED | SUBSCRIPTION_ISSUE' },
            daysRemaining: { type: 'number' },
            critical: { type: 'boolean', description: 'True if ≤5 days remain to respond.' },
            riskScore: { type: 'number', description: '0–100. Higher = more likely to lose.' },
            recommendation: { type: 'string', enum: ['FIGHT', 'ACCEPT'] },
            fraudFlags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  patternId: { type: 'string' },
                  type: { type: 'string' },
                },
              },
            },
          },
        },
        409: { type: 'object', properties: { error: { type: 'object' } } },
        422: { type: 'object', properties: { error: { type: 'object' } } },
      },
    },
  }, async (req, reply) => {
    const body = CreateChargebackSchema.parse(req.body);

    const emailDomain = body.cardholderEmail.split('@')[1] ?? '';
    const shippingAddressNorm = normalizeAddress(body.shippingAddress);
    const category = categorize(body.reasonCodeRaw, body.reasonText);

    let chargeback;
    try {
      chargeback = await prisma.chargeback.create({
        data: {
          disputeId: body.disputeId,
          transactionId: body.transactionId,
          amountMinor: toMinor(body.amount),
          currency: body.currency,
          reasonCodeRaw: body.reasonCodeRaw,
          reasonText: body.reasonText,
          category,
          cardholderName: body.cardholderName,
          cardholderEmail: body.cardholderEmail,
          emailDomain,
          shippingAddress: body.shippingAddress,
          shippingAddressNorm,
          ipAddress: body.ipAddress,
          orderDate: body.orderDate,
          filingDate: body.filingDate,
          responseDeadline: body.responseDeadline,
          status: 'OPEN',
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return reply.status(409).send({ error: { code: 'CONFLICT', message: 'Duplicate disputeId or transactionId' } });
      }
      throw err;
    }

    // Score
    const history = await prisma.chargeback.findMany({
      where: { category, status: { in: ['WON', 'LOST'] }, id: { not: chargeback.id } },
      take: 20,
      orderBy: { filingDate: 'desc' },
    });
    const risk = scoreChargeback(chargeback, history, {
      hasTrackingNumber: body.hasTrackingNumber,
      priorRefundProcessed: body.priorRefundProcessed,
      avsMatch: body.avsMatch,
    });

    // Update with risk
    await prisma.chargeback.update({
      where: { id: chargeback.id },
      data: { riskScore: risk.riskScore, recommendation: risk.recommendation },
    });

    // Fraud detection
    const fraudFlags = await runFraudDetection(chargeback);

    const { daysRemaining, critical } = computeUrgency(chargeback.responseDeadline);

    return reply.status(201).send({
      id: chargeback.id,
      disputeId: chargeback.disputeId,
      transactionId: chargeback.transactionId,
      category,
      daysRemaining,
      critical,
      riskScore: risk.riskScore,
      recommendation: risk.recommendation,
      fraudFlags,
    });
  });

  // GET /chargebacks
  app.get('/chargebacks', {
    schema: {
      description: 'Lists all chargebacks with optional filters. Each result includes computed urgency fields (daysRemaining, critical). Use critical=true to surface disputes that need immediate attention (≤5 days to deadline).',
      tags: ['Chargebacks'],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category. Example: FRAUD' },
          status: { type: 'string', description: 'Filter by status: OPEN | RESPONDED | WON | LOST' },
          critical: { type: 'string', enum: ['true', 'false'], description: 'Filter by urgency. true = ≤5 days remaining.' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, async (req, reply) => {
    const query = ListQuerySchema.parse(req.query);

    const now = new Date();
    const criticalDeadline = new Date(now.getTime() + 5 * 86_400_000);

    const where: any = {};
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.critical === 'true') where.responseDeadline = { lt: criticalDeadline };
    if (query.critical === 'false') where.responseDeadline = { gte: criticalDeadline };

    const chargebacks = await prisma.chargeback.findMany({
      where,
      take: query.limit,
      skip: query.offset,
      orderBy: { filingDate: 'desc' },
    });

    return reply.send(chargebacks.map(c => {
      const { daysRemaining, critical } = computeUrgency(c.responseDeadline);
      return { ...c, daysRemaining, critical };
    }));
  });

  // GET /chargebacks/:id
  app.get('/chargebacks/:id', {
    schema: {
      description: 'Returns full detail for a single chargeback by its internal UUID, including computed urgency fields (daysRemaining, critical).',
      tags: ['Chargebacks'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Internal chargeback UUID' },
        },
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        404: { type: 'object', properties: { error: { type: 'object' } } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const chargeback = await prisma.chargeback.findUnique({ where: { id } });
    if (!chargeback) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Chargeback not found' } });

    const { daysRemaining, critical } = computeUrgency(chargeback.responseDeadline);
    return reply.send({ ...chargeback, daysRemaining, critical });
  });
}
