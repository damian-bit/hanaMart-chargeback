import { faker } from '@faker-js/faker/locale/ko';
import { KOREAN_NAMES, SEOUL_ADDRESSES } from './korean.js';
import { normalizeAddress } from '../services/fraud-detection.service.js';
import { categorize } from '../services/categorization.service.js';
import type { Category } from '../domain/evidence-catalog.js';

faker.seed(42);

type ChargebackInput = {
  disputeId: string;
  transactionId: string;
  amountMinor: number;
  currency: string;
  reasonCodeRaw?: string;
  reasonText?: string;
  category: string;
  cardholderName: string;
  cardholderEmail: string;
  emailDomain: string;
  shippingAddress: string;
  shippingAddressNorm: string;
  ipAddress?: string;
  orderDate: Date;
  filingDate: Date;
  responseDeadline: Date;
  status: string;
  respondedAt?: Date;
  riskScore?: number;
  recommendation?: string;
};

const CATEGORIES: Category[] = [
  'FRAUD', 'FRAUD', 'FRAUD', 'FRAUD',        // 48 total (4/10)
  'PRODUCT_NOT_RECEIVED', 'PRODUCT_NOT_RECEIVED', // 24 (2/10)
  'NOT_AS_DESCRIBED',                          // 18 (1.5/10)
  'DUPLICATE',                                 // 12 (1/10)
  'CREDIT_NOT_PROCESSED',                      // 12 (1/10)
  'SUBSCRIPTION',                              // 6 (0.5/10)
];

function pickCategory(index: number): Category {
  // Distribution: 48 FRAUD, 24 PNR, 18 NAD, 12 DUP, 12 CNP, 6 SUB = 120 total
  if (index < 48) return 'FRAUD';
  if (index < 72) return 'PRODUCT_NOT_RECEIVED';
  if (index < 90) return 'NOT_AS_DESCRIBED';
  if (index < 102) return 'DUPLICATE';
  if (index < 114) return 'CREDIT_NOT_PROCESSED';
  return 'SUBSCRIPTION';
}

function pickStatus(category: Category, index: number): { status: string; respondedAt?: Date; filingDate: Date } {
  const filingDate = faker.date.recent({ days: 90 });
  const isClosed = index < 70;

  if (!isClosed) {
    return { status: 'OPEN', filingDate };
  }

  // 48 LOST, 22 WON among 70 closed
  // FRAUD/NOT_AS_DESCRIBED: ~75% LOST; DUPLICATE/CREDIT: ~70% WON
  let isLost: boolean;
  if (category === 'FRAUD' || category === 'NOT_AS_DESCRIBED') {
    isLost = faker.number.float() < 0.75;
  } else if (category === 'DUPLICATE' || category === 'CREDIT_NOT_PROCESSED') {
    isLost = faker.number.float() < 0.30;
  } else {
    isLost = faker.number.float() < 0.50;
  }

  const status = isLost ? 'LOST' : 'WON';
  const respondedAt = new Date(filingDate.getTime() + faker.number.int({ min: 1, max: 20 }) * 86_400_000);
  return { status, respondedAt, filingDate };
}

function makeReasonCode(category: Category): string {
  const map: Record<Category, string> = {
    FRAUD: '10.4',
    PRODUCT_NOT_RECEIVED: '13.1',
    NOT_AS_DESCRIBED: '13.2',
    DUPLICATE: '12.1',
    CREDIT_NOT_PROCESSED: '12.6',
    SUBSCRIPTION: '13.7',
  };
  return map[category];
}

export function generateChargebacks(): ChargebackInput[] {
  const chargebacks: ChargebackInput[] = [];
  const P1_ADDRESS = '123 Gangnam-daero, Gangnam-gu, Seoul';
  const P1_ADDRESS_NORM = normalizeAddress(P1_ADDRESS);

  for (let i = 0; i < 120; i++) {
    const category = pickCategory(i);
    const name = KOREAN_NAMES[i % KOREAN_NAMES.length];
    const email = faker.internet.email();
    const emailDomain = (email.split('@')[1] ?? 'example.com').toLowerCase();

    let shippingAddress: string;
    let filingDate: Date;
    let amountMinor: number;

    // Planted patterns
    if (i < 9) {
      // P1: ADDRESS cluster
      shippingAddress = P1_ADDRESS;
      const daysAgo = faker.number.int({ min: 1, max: 60 });
      filingDate = new Date(Date.now() - daysAgo * 86_400_000);
      amountMinor = faker.number.int({ min: 1000, max: 50000 });
    } else if (i < 16) {
      // P2: TIMING cluster — unique addresses so they don't also trigger ADDRESS pattern
      shippingAddress = `${i * 13 + 100} Timing-ro, Seongdong-gu, Seoul`;
      const baseDate = new Date('2026-04-15T00:00:00Z');
      const hoursOffset = faker.number.int({ min: 0, max: 22 });
      filingDate = new Date(baseDate.getTime() + hoursOffset * 3_600_000);
      amountMinor = faker.number.int({ min: 1000, max: 50000 });
    } else if (i < 27) {
      // P3: AMOUNT cluster ($50-$54, all in bucket 10: 5000-5499 minor) — unique addresses
      shippingAddress = `${i * 11 + 200} Amount-daero, Nowon-gu, Seoul`;
      const daysAgo = faker.number.int({ min: 1, max: 30 });
      filingDate = new Date(Date.now() - daysAgo * 86_400_000);
      amountMinor = faker.number.int({ min: 5000, max: 5499 });
    } else if (i < 32) {
      // P4: EMAIL_DOMAIN cluster — unique addresses
      shippingAddress = `${i * 9 + 300} Email-ro, Dobong-gu, Seoul`;
      const daysAgo = faker.number.int({ min: 1, max: 60 });
      filingDate = new Date(Date.now() - daysAgo * 86_400_000);
      amountMinor = faker.number.int({ min: 1000, max: 50000 });
    } else if (i < 36) {
      // P5: IP cluster — unique addresses
      shippingAddress = `${i * 17 + 400} IP-daero, Gangbuk-gu, Seoul`;
      const daysAgo = faker.number.int({ min: 1, max: 60 });
      filingDate = new Date(Date.now() - daysAgo * 86_400_000);
      amountMinor = faker.number.int({ min: 1000, max: 50000 });
    } else {
      // Unique address per chargeback to avoid false ADDRESS pattern matches
      const streets = ['Teheran-ro', 'Dosan-daero', 'Eonju-ro', 'Nonhyeon-ro', 'Seocho-daero', 'Banpo-ro', 'Yeongdong-daero'];
      const gus = ['Gangnam-gu', 'Seocho-gu', 'Mapo-gu', 'Yongsan-gu', 'Jongno-gu', 'Jung-gu', 'Songpa-gu'];
      shippingAddress = `${i * 7 + 1} ${streets[i % streets.length]}, ${gus[i % gus.length]}, Seoul`;
      filingDate = faker.date.recent({ days: 90 });
      amountMinor = faker.number.int({ min: 1500, max: 50000 });
    }

    const shippingAddressNorm = normalizeAddress(shippingAddress);
    const orderDate = new Date(filingDate.getTime() - faker.number.int({ min: 1, max: 30 }) * 86_400_000);
    const deadlineDays = faker.number.int({ min: 1, max: 30 });
    const responseDeadline = new Date(filingDate.getTime() + deadlineDays * 86_400_000);

    // P4: force suspicious email domain
    const plantedEmailDomain = (i >= 27 && i < 32) ? 'temp-mail-ko.test' : null;
    const plantedEmail = plantedEmailDomain ? `user${i}@${plantedEmailDomain}` : email;
    const finalEmailDomain = plantedEmailDomain ?? emailDomain;

    // P5: force shared IP
    const plantedIp = (i >= 32 && i < 36) ? '211.234.56.78' : null;
    const finalIp = plantedIp ?? faker.internet.ip();

    const isClosed = i < 70;
    const { status, respondedAt } = (() => {
      if (!isClosed) return { status: 'OPEN', respondedAt: undefined };
      let isLost: boolean;
      if (category === 'FRAUD' || category === 'NOT_AS_DESCRIBED') {
        isLost = faker.number.float() < 0.75;
      } else if (category === 'DUPLICATE' || category === 'CREDIT_NOT_PROCESSED') {
        isLost = faker.number.float() < 0.30;
      } else {
        isLost = faker.number.float() < 0.50;
      }
      const s = isLost ? 'LOST' : 'WON';
      const r = new Date(filingDate.getTime() + faker.number.int({ min: 1, max: 20 }) * 86_400_000);
      return { status: s, respondedAt: r };
    })();

    const reasonCodeRaw = makeReasonCode(category);

    chargebacks.push({
      disputeId: `DISP-${String(i + 1).padStart(5, '0')}`,
      transactionId: `TXN-${faker.string.alphanumeric(12).toUpperCase()}`,
      amountMinor,
      currency: 'USD',
      reasonCodeRaw,
      category,
      cardholderName: name,
      cardholderEmail: plantedEmail,
      emailDomain: finalEmailDomain,
      shippingAddress,
      shippingAddressNorm,
      ipAddress: finalIp,
      orderDate,
      filingDate,
      responseDeadline,
      status,
      respondedAt,
    });
  }

  return chargebacks;
}
