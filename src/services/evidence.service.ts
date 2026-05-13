import { createHash } from 'crypto';
import { EVIDENCE_CATALOG } from '../domain/evidence-catalog.js';
import type { Category } from '../domain/evidence-catalog.js';

export function simulateEvidenceFetch(transactionId: string, category: Category): { retrieved: string[]; missing: string[] } {
  const items = EVIDENCE_CATALOG[category];
  const hash = createHash('sha256').update(transactionId).digest('hex');
  const retrieved: string[] = [];
  const missing: string[] = [];
  items.forEach((item, index) => {
    const byte = parseInt(hash.slice(index * 2, index * 2 + 2), 16);
    if (byte < 204) retrieved.push(item);
    else missing.push(item);
  });
  return { retrieved, missing };
}
