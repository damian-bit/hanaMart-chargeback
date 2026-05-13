import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSummary, getWinRateByCategory, getAvgResponseTime, getTopFraudPatterns } from '../services/analytics.service.js';

export default async function analyticsRoutes(app: FastifyInstance) {
  app.get('/analytics/summary', {
    schema: {
      description: 'Returns aggregate chargeback metrics for a given calendar month: total disputes filed, total amount at risk in USD, and a breakdown by status (OPEN, RESPONDED, WON, LOST).',
      tags: ['Analytics'],
      querystring: {
        type: 'object',
        required: ['month'],
        properties: {
          month: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'Calendar month in YYYY-MM format. Example: 2026-04' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            month: { type: 'string' },
            total: { type: 'integer' },
            totalAmountUSD: { type: 'number' },
            byStatus: {
              type: 'object',
              properties: {
                OPEN: { type: 'integer' },
                RESPONDED: { type: 'integer' },
                WON: { type: 'integer' },
                LOST: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.query);
    return reply.send(await getSummary(month));
  });

  app.get('/analytics/win-rate-by-category', {
    schema: {
      description: 'Returns win and loss counts and win rate percentage for each dispute category. Useful to identify which dispute types HanaMart is winning or losing most often.',
      tags: ['Analytics'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              total: { type: 'integer' },
              won: { type: 'integer' },
              lost: { type: 'integer' },
              winRate: { type: 'number', description: '0.0 to 1.0' },
            },
          },
        },
      },
    },
  }, async (_req, reply) => {
    return reply.send(await getWinRateByCategory());
  });

  app.get('/analytics/avg-response-time', {
    schema: {
      description: 'Returns the average number of days between filing and response timestamp across disputes that already have respondedAt (RESPONDED, WON, LOST).',
      tags: ['Analytics'],
      response: {
        200: {
          type: 'object',
          properties: {
            avgDays: { type: ['number', 'null'], description: 'Average days to respond. Null if no responded disputes exist.' },
            count: { type: 'integer', description: 'Number of disputes included in the average.' },
          },
        },
      },
    },
  }, async (_req, reply) => {
    return reply.send(await getAvgResponseTime());
  });

  app.get('/analytics/top-fraud-patterns', {
    schema: {
      description: 'Returns the top N fraud patterns ranked by number of associated disputes. Useful for prioritizing fraud investigation efforts.',
      tags: ['Analytics'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, default: 5, description: 'Number of patterns to return. Default: 5.' },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              signature: { type: 'string' },
              description: { type: 'string' },
              disputeCount: { type: 'integer' },
              totalAmountMinor: { type: 'integer' },
              firstSeen: { type: 'string', format: 'date-time' },
              lastSeen: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).default(5) }).parse(req.query);
    return reply.send(await getTopFraudPatterns(limit));
  });
}
