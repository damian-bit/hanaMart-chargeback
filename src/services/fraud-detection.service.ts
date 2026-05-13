import type { Chargeback } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export function normalizeAddress(address: string): string {
  return address.toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function runFraudDetection(chargeback: Chargeback): Promise<Array<{ patternId: string; type: string }>> {
  const results: Array<{ patternId: string; type: string }> = [];

  // 1. ADDRESS detector: shippingAddressNorm exact match, ≥3 disputes in last 90 days
  const ninetyDaysAgo = new Date(chargeback.filingDate.getTime() - 90 * 86_400_000);
  const addressMatches = await prisma.chargeback.count({
    where: {
      shippingAddressNorm: chargeback.shippingAddressNorm,
      filingDate: { gte: ninetyDaysAgo },
    },
  });

  if (addressMatches >= 3) {
    const signature = chargeback.shippingAddressNorm;
    const patternId = await upsertPatternAndLink('ADDRESS', signature, `Address cluster: ${chargeback.shippingAddress}`, chargeback);
    results.push({ patternId, type: 'ADDRESS' });
  }

  // 2. TIMING detector: 48h window centered on the chargeback's UTC day (one pattern per day)
  // Threshold ≥7 matches P2's planted cluster while avoiding false positives in random data
  const dayBucket = chargeback.filingDate.toISOString().slice(0, 10); // YYYY-MM-DD
  const dayStart = new Date(`${dayBucket}T00:00:00.000Z`);
  const timingWindowStart = new Date(dayStart.getTime() - 24 * 3_600_000);
  const timingWindowEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
  const timingMatches = await prisma.chargeback.count({
    where: {
      filingDate: { gte: timingWindowStart, lte: timingWindowEnd },
    },
  });

  if (timingMatches >= 7) {
    const patternId = await upsertPatternAndLink('TIMING', dayBucket, `${timingMatches} disputes filed within 48h window around ${dayBucket}`, chargeback);
    results.push({ patternId, type: 'TIMING' });
  }

  // 3. AMOUNT detector: floor(amountMinor / 500) bucket, ≥6 in last 30 days
  const bucket = Math.floor(chargeback.amountMinor / 500);
  const thirtyDaysAgo = new Date(chargeback.filingDate.getTime() - 30 * 86_400_000);
  const bucketMin = bucket * 500;
  const bucketMax = (bucket + 1) * 500 - 1;
  const amountMatches = await prisma.chargeback.count({
    where: {
      amountMinor: { gte: bucketMin, lte: bucketMax },
      filingDate: { gte: thirtyDaysAgo },
    },
  });

  if (amountMatches >= 6) {
    const signature = String(bucket);
    const patternId = await upsertPatternAndLink('AMOUNT', signature, `Amount cluster bucket ${bucket} ($${(bucketMin / 100).toFixed(2)}-$${(bucketMax / 100).toFixed(2)})`, chargeback);
    results.push({ patternId, type: 'AMOUNT' });
  }

  // 4. EMAIL_DOMAIN detector: same email domain (excluding common providers), ≥4 in last 90 days
  const COMMON_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'naver.com', 'outlook.com', 'daum.net', 'hanmail.net', 'yahoo.co.kr', 'nate.com', 'kakao.com', 'korea.com', 'icloud.com', 'me.com']);
  if (!COMMON_DOMAINS.has(chargeback.emailDomain)) {
    const emailMatches = await prisma.chargeback.count({
      where: {
        emailDomain: chargeback.emailDomain,
        filingDate: { gte: ninetyDaysAgo },
      },
    });
    if (emailMatches >= 4) {
      const patternId = await upsertPatternAndLink('EMAIL_DOMAIN', chargeback.emailDomain, `Email domain cluster: ${chargeback.emailDomain}`, chargeback);
      results.push({ patternId, type: 'EMAIL_DOMAIN' });
    }
  }

  // 5. IP detector: same IP address, ≥3 in last 90 days
  if (chargeback.ipAddress) {
    const ipMatches = await prisma.chargeback.count({
      where: {
        ipAddress: chargeback.ipAddress,
        filingDate: { gte: ninetyDaysAgo },
      },
    });
    if (ipMatches >= 3) {
      const patternId = await upsertPatternAndLink('IP', chargeback.ipAddress, `IP address cluster: ${chargeback.ipAddress}`, chargeback);
      results.push({ patternId, type: 'IP' });
    }
  }

  return results;
}

export async function scanAllChargebacks(): Promise<{ scanned: number; patternsUpserted: number }> {
  await prisma.fraudPatternDispute.deleteMany();
  await prisma.fraudPattern.deleteMany();

  const chargebacks = await prisma.chargeback.findMany({ orderBy: { filingDate: 'asc' } });
  const patternIds = new Set<string>();

  for (const cb of chargebacks) {
    const flags = await runFraudDetection(cb);
    for (const f of flags) patternIds.add(f.patternId);
  }

  return { scanned: chargebacks.length, patternsUpserted: patternIds.size };
}

async function upsertPatternAndLink(type: string, signature: string, description: string, chargeback: Chargeback): Promise<string> {
  // Step 1: upsert the pattern (may or may not exist)
  const existing = await prisma.fraudPattern.findUnique({ where: { type_signature: { type, signature } } });
  let pattern;
  if (existing) {
    pattern = await prisma.fraudPattern.update({
      where: { id: existing.id },
      data: {
        disputeCount: { increment: 1 },
        totalAmountMinor: { increment: chargeback.amountMinor },
        lastSeen: chargeback.filingDate > existing.lastSeen ? chargeback.filingDate : existing.lastSeen,
      },
    });
  } else {
    pattern = await prisma.fraudPattern.create({
      data: {
        type,
        signature,
        description,
        disputeCount: 1,
        totalAmountMinor: chargeback.amountMinor,
        firstSeen: chargeback.filingDate,
        lastSeen: chargeback.filingDate,
      },
    });
  }

  // Step 2: link pattern to chargeback (idempotent)
  await prisma.fraudPatternDispute.upsert({
    where: { patternId_chargebackId: { patternId: pattern.id, chargebackId: chargeback.id } },
    create: { patternId: pattern.id, chargebackId: chargeback.id },
    update: {},
  });

  return pattern.id;
}
