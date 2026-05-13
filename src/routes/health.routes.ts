import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health', {
    schema: {
      description: 'Returns server status and database connectivity. Use this to verify the service is running before sending requests.',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            db: { type: 'string', example: 'ok' },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'error' },
            db: { type: 'string', example: 'error' },
          },
        },
      },
    },
  }, async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: 'ok', db: 'ok' });
    } catch {
      return reply.status(503).send({ status: 'error', db: 'error' });
    }
  });
}
