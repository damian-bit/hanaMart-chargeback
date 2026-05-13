import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { generateChargebacks } from './generate.js';
import { runFraudDetection } from '../services/fraud-detection.service.js';

async function main() {
  const existingCount = await prisma.chargeback.count();
  if (existingCount > 0) {
    console.log(`Database already has ${existingCount} chargebacks — skipping seed.`);
    return;
  }

  console.log('Truncating tables...');
  await prisma.fraudPatternDispute.deleteMany();
  await prisma.fraudPattern.deleteMany();
  await prisma.chargeback.deleteMany();

  const chargebacks = generateChargebacks();
  console.log(`Inserting ${chargebacks.length} chargebacks...`);

  const created = [];
  for (const cb of chargebacks) {
    const c = await prisma.chargeback.create({ data: cb });
    created.push(c);
  }

  console.log('Running fraud detection on all chargebacks...');
  let fraudCount = 0;
  for (const cb of created) {
    const flags = await runFraudDetection(cb);
    if (flags.length > 0) fraudCount++;
  }

  const stats = await prisma.chargeback.groupBy({ by: ['status'], _count: true });
  const patternCount = await prisma.fraudPattern.count();

  console.log('\n=== Seed Summary ===');
  console.log(`Total chargebacks: ${created.length}`);
  for (const s of stats) {
    console.log(`  ${s.status}: ${s._count}`);
  }
  console.log(`Fraud patterns detected: ${patternCount}`);
  console.log(`Chargebacks with fraud flags: ${fraudCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
