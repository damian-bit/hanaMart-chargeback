import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { simulateEvidenceFetch } from '../services/evidence.service.js';
import type { Category } from '../domain/evidence-catalog.js';

export default async function evidenceRoutes(app: FastifyInstance) {
  app.post('/chargebacks/:id/evidence/fetch', {
    schema: {
      description: 'Simulates fetching evidence from external systems (shipping provider, order management system) for a given dispute. Returns which evidence items were successfully retrieved and which are still missing.',
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
            retrieved: { type: 'array', items: { type: 'string' }, description: 'Evidence items successfully fetched from external systems.' },
            missing: { type: 'array', items: { type: 'string' }, description: 'Evidence items that could not be retrieved and must be gathered manually.' },
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

    const result = simulateEvidenceFetch(chargeback.transactionId, chargeback.category as Category);
    return reply.send(result);
  });
}
