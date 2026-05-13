import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { scoreChargeback } from '../services/risk.service.js';

export default async function riskRoutes(app: FastifyInstance) {
  app.get('/chargebacks/:id/risk', {
    schema: {
      description: 'Returns the risk assessment for a dispute: a score from 0–100 estimating the probability of losing if contested, a FIGHT or ACCEPT recommendation, a factor-by-factor breakdown of how the score was computed, and the list of evidence items needed to fight the dispute.',
      tags: ['Chargebacks'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Internal chargeback UUID' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            riskScore: { type: 'number', description: '0–100. Higher = more likely to lose.' },
            recommendation: { type: 'string', enum: ['FIGHT', 'ACCEPT'] },
            breakdown: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  factor: { type: 'string' },
                  delta: { type: 'number' },
                },
              },
            },
            requiredEvidence: { type: 'array', items: { type: 'string' } },
            daysRemaining: { type: 'number' },
            critical: { type: 'boolean' },
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
    const chargeback = await prisma.chargeback.findUnique({ where: { id } });
    if (!chargeback) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Chargeback not found' } });

    const history = await prisma.chargeback.findMany({
      where: {
        category: chargeback.category,
        status: { in: ['WON', 'LOST'] },
        id: { not: chargeback.id },
      },
      take: 20,
      orderBy: { filingDate: 'desc' },
    });

    const result = scoreChargeback(chargeback, history);
    return reply.send(result);
  });
}
