import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(swagger, {
    openapi: {
      info: { title: 'HanaMart Chargeback Triage API', version: '1.0.0' },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/', (_req: any, reply: any) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HanaMart Chargeback Triage API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 2rem; }
    .container { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; color: #e6edf3; }
    p.subtitle { color: #6e7681; margin-bottom: 1.5rem; font-size: 0.9rem; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; }
    .card .method { font-weight: 600; font-size: 0.8rem; min-width: 4.5rem; padding: 0.2rem 0.5rem; border-radius: 4px; text-align: center; }
    .method.get { background: #1f3a5f; color: #58a6ff; }
    .method.post { background: #1a3a2a; color: #3fb950; }
    .card .path { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.85rem; flex: 1; margin: 0 1rem; color: #e6edf3; }
    .card .desc { font-size: 0.8rem; color: #6e7681; min-width: 6rem; text-align: right; }
    .spec { font-size: 0.72rem; color: #6e7681; font-style: italic; margin-top: 0.25rem; display: block; padding-left: 5.5rem; width: 100%; }
    .card a { text-decoration: none; color: inherit; display: flex; align-items: center; width: 100%; }
    .card a:hover { opacity: 0.75; }
    .section-title { font-size: 0.85rem; font-weight: 600; color: #6e7681; text-transform: uppercase; letter-spacing: 0.05em; margin: 1.5rem 0 0.5rem; }
    .badge { display: inline-block; font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 10px; background: #3d2b00; color: #f0883e; margin-left: 0.5rem; }
    .footer { margin-top: 2rem; font-size: 0.8rem; color: #6e7681; text-align: center; }
  </style>
</head>
<body>
    <div class="container">
    <h1>🔁 HanaMart Chargeback Triage</h1>
    <p class="subtitle">API running at http://localhost:${env.PORT}</p>
    <p class="subtitle" style="margin-top: -1rem;">🔗 Production: <a href="https://hanamart-chargeback-production.up.railway.app/" target="_blank" style="color:#58a6ff;">hanamart-chargeback-production.up.railway.app</a> &nbsp;·&nbsp; <a href="/docs" style="color:#58a6ff;">📖 Swagger Docs</a></p>

    <div class="section-title" style="margin-top: 1.5rem;">⚡ Quick Start</div>
    <div class="card" style="display: block; border-color: #1f6feb;">
      <ol style="margin: 0.5rem 0 0.5rem 1.2rem; color: #c9d1d9; line-height: 1.8; font-size: 0.85rem;">
        <li><strong>Step 1</strong> — Open <a href="/docs" style="color:#58a6ff;">/docs</a> (Swagger UI) and execute <code>POST /chargebacks</code></li>
        <li><strong>Step 2</strong> — Copy the returned <code>id</code> and call <code>GET /chargebacks/&#123;id&#125;/risk</code> to see risk score & evidence</li>
        <li><strong>Step 3</strong> — Call <code>GET /fraud-patterns</code> to verify detected fraud patterns</li>
      </ol>
    </div>

    <div class="section-title">📖 Documentation</div>
    <div class="card"><a href="/docs"><span class="method get">GET</span><span class="path">/docs</span><span class="desc">Swagger UI</span></a><span class="spec">Infrastructure — Auto-generated OpenAPI documentation for API reference</span></div>

    <div class="section-title">💚 System</div>
    <div class="card"><a href="/health"><span class="method get">GET</span><span class="path">/health</span><span class="desc">Server & DB status</span></a><span class="spec">Infrastructure — Health check endpoint for service monitoring</span></div>

    <div class="section-title">🧾 Chargebacks (Core Req 1)</div>
    <div class="card" style="border-left: 3px solid #3fb950;"><span class="method post">POST</span><span class="path">/chargebacks</span><span class="desc">Ingest new dispute</span><span class="spec">Core Req 1 — "Build a service that accepts incoming chargeback notifications and automatically parse, store, categorize and calculate response urgency"</span></div>
    <div class="card" style="border-left: 3px solid #3fb950;"><a href="/chargebacks"><span class="method get">GET</span><span class="path">/chargebacks</span><span class="desc">List all</span></a><span class="spec">Core Req 1 — "Return a structured response confirming ingestion and initial classification"</span></div>
    <div class="card"><span class="method get">GET</span><span class="path">/chargebacks/:id</span><span class="desc">Detail</span><span class="spec">Core Req 1 — Full detail for an individual dispute record</span></div>
    <div class="card" style="border-left: 3px solid #58a6ff;"><span class="method get">GET</span><span class="path">/chargebacks/:id/risk</span><span class="desc">Risk score & evidence</span><span class="spec">Core Req 2 — "Assign a risk score (0-100)… Recommend specific evidence types… Flag whether to fight or accept"</span></div>
    <div class="card"><span class="method post">POST</span><span class="path">/chargebacks/:id/evidence/fetch</span><span class="desc">Simulate evidence fetch <span class="badge">Stretch</span></span><span class="spec">Stretch B — "Simulate fetching evidence from external systems (mock API calls to a shipping provider or order management system)"</span></div>

    <div class="section-title">🚨 Fraud (Core Req 3)</div>
    <div class="card" style="border-left: 3px solid #f0883e;"><a href="/fraud-patterns"><span class="method get">GET</span><span class="path">/fraud-patterns</span><span class="desc">List detected patterns</span></a><span class="spec">Core Req 3 — "Provide an endpoint to query detected fraud patterns"</span></div>
    <div class="card"><span class="method get">GET</span><span class="path">/fraud-patterns/:id</span><span class="desc">Pattern detail</span><span class="spec">Core Req 3 — "…with the ability to see all disputes associated with a given pattern"</span></div>
    <div class="card"><span class="method post">POST</span><span class="path">/fraud-patterns/scan</span><span class="desc">Re-scan all disputes</span><span class="spec">Core Req 3 — "Generate fraud alerts: when a pattern is detected, create an alert summarizing the pattern and listing all related dispute IDs"</span></div>

    <div class="section-title">📊 Analytics <span class="badge">Stretch</span></div>
    <div class="card"><a href="/analytics/summary"><span class="method get">GET</span><span class="path">/analytics/summary</span><span class="desc">Monthly summary</span></a><span class="spec">Stretch A — "Total chargebacks this month vs. last month / Financial impact (total amount lost to chargebacks)"</span></div>
    <div class="card"><a href="/analytics/win-rate-by-category"><span class="method get">GET</span><span class="path">/analytics/win-rate-by-category</span><span class="desc">Win rates</span></a><span class="spec">Stretch A — "Win rate by dispute category"</span></div>
    <div class="card"><a href="/analytics/avg-response-time"><span class="method get">GET</span><span class="path">/analytics/avg-response-time</span><span class="desc">Avg days to respond</span></a><span class="spec">Stretch A — "Average response time"</span></div>
    <div class="card"><a href="/analytics/top-fraud-patterns"><span class="method get">GET</span><span class="path">/analytics/top-fraud-patterns</span><span class="desc">Top patterns by volume</span></a><span class="spec">Stretch A — "Top 5 fraud patterns by volume"</span></div>

    <div class="footer">HanaMart Challenge — Yuno</div>
  </div>
</body>
</html>`);
  });

  app.setErrorHandler((error: any, _request: any, reply: any) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors },
      });
    }
    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: { code: 'HTTP_ERROR', message: error.message },
      });
    }
    logger.error(error);
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  await app.register((await import('./routes/health.routes.js')).default);
  await app.register((await import('./routes/chargebacks.routes.js')).default);
  await app.register((await import('./routes/risk.routes.js')).default);
  await app.register((await import('./routes/fraud.routes.js')).default);
  await app.register((await import('./routes/analytics.routes.js')).default);
  await app.register((await import('./routes/evidence.routes.js')).default);

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  buildApp().then(app => app.listen({ port: env.PORT, host: '0.0.0.0' }));
}