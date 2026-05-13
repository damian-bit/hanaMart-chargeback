import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { toMajor } from '../domain/money.js';
import { scanAllChargebacks } from '../services/fraud-detection.service.js';

const fraudPatternSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string', description: 'ADDRESS | TIMING | AMOUNT | EMAIL_DOMAIN | IP' },
    signature: { type: 'string' },
    description: { type: 'string' },
    disputeCount: { type: 'integer' },
    totalAmountMinor: { type: 'integer' },
    totalAmountUSD: { type: 'number' },
    firstSeen: { type: 'string', format: 'date-time' },
    lastSeen: { type: 'string', format: 'date-time' },
  },
};

export default async function fraudRoutes(app: FastifyInstance) {
  // GET /fraud-patterns
  app.get('/fraud-patterns', {
    schema: {
      description: 'Lists all detected fraud patterns ordered by dispute volume. Each pattern represents a cluster of chargebacks sharing a suspicious signal: same shipping address, timing burst within 48h, similar dollar amounts, shared email domain, or shared IP address.',
      tags: ['Fraud'],
      response: {
        200: {
          type: 'array',
          items: fraudPatternSchema,
        },
      },
    },
  }, async (_req, reply) => {
    const patterns = await prisma.fraudPattern.findMany({ orderBy: { disputeCount: 'desc' } });
    return reply.send(patterns.map(p => ({ ...p, totalAmountUSD: toMajor(p.totalAmountMinor) })));
  });

  // GET /fraud-patterns/:id
  app.get('/fraud-patterns/:id', {
    schema: {
      description: 'Returns full detail of a fraud pattern including the list of all associated disputes. Use this to investigate which specific chargebacks belong to a suspected fraud ring.',
      tags: ['Fraud'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Fraud pattern UUID' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ...fraudPatternSchema.properties,
            disputes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  disputeId: { type: 'string' },
                  category: { type: 'string' },
                  amountMinor: { type: 'integer' },
                  filingDate: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: { error: { type: 'object' } },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const pattern = await prisma.fraudPattern.findUnique({
      where: { id },
      include: {
        disputes: {
          include: { chargeback: { select: { id: true, disputeId: true, category: true, amountMinor: true, filingDate: true } } },
        },
      },
    });
    if (!pattern) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Pattern not found' } });

    const disputes = pattern.disputes.map(d => ({
      id: d.chargeback.id,
      disputeId: d.chargeback.disputeId,
      category: d.chargeback.category,
      amountMinor: d.chargeback.amountMinor,
      filingDate: d.chargeback.filingDate,
    }));

    return reply.send({ ...pattern, totalAmountUSD: toMajor(pattern.totalAmountMinor), disputes });
  });

  // POST /fraud-patterns/scan
  app.post('/fraud-patterns/scan', {
    schema: {
      description: 'Re-runs fraud detection across all chargebacks from scratch. Clears existing pattern data and rebuilds it by re-evaluating every dispute. Use this after bulk-importing chargebacks or when patterns seem stale.',
      tags: ['Fraud'],
      response: {
        200: {
          type: 'object',
          properties: {
            scanned: { type: 'integer', description: 'Total chargebacks evaluated.' },
            patternsUpserted: { type: 'integer', description: 'Number of distinct fraud patterns created.' },
          },
        },
      },
    },
  }, async (_req, reply) => {
    const result = await scanAllChargebacks();
    return reply.send(result);
  });
}
