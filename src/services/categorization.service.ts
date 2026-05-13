import type { Category } from '../domain/evidence-catalog.js';
import { REASON_CODES, keywordMatch } from '../domain/reason-codes.js';

function normalize(code: string): string {
  return code.trim().toUpperCase();
}

export function categorize(reasonCode?: string | null, reasonText?: string | null): Category {
  if (reasonCode) {
    const hit = REASON_CODES.get(normalize(reasonCode));
    if (hit) return hit;
  }
  if (reasonText) {
    const guess = keywordMatch(reasonText);
    if (guess) return guess;
  }
  return 'FRAUD';
}
