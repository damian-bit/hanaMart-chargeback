import type { Category } from './evidence-catalog.js';

export const REASON_CODES: Map<string, Category> = new Map([
  // Visa
  ['10.1', 'FRAUD'],
  ['10.2', 'FRAUD'],
  ['10.3', 'FRAUD'],
  ['10.4', 'FRAUD'],
  ['10.5', 'FRAUD'],
  ['11.1', 'FRAUD'],
  ['11.2', 'FRAUD'],
  ['11.3', 'FRAUD'],
  ['12.1', 'DUPLICATE'],
  ['12.2', 'DUPLICATE'],
  ['12.3', 'DUPLICATE'],
  ['12.4', 'DUPLICATE'],
  ['12.5', 'DUPLICATE'],
  ['12.6', 'CREDIT_NOT_PROCESSED'],
  ['12.7', 'SUBSCRIPTION'],
  ['13.1', 'PRODUCT_NOT_RECEIVED'],
  ['13.9', 'PRODUCT_NOT_RECEIVED'],
  ['13.2', 'NOT_AS_DESCRIBED'],
  ['13.3', 'NOT_AS_DESCRIBED'],
  ['13.4', 'NOT_AS_DESCRIBED'],
  ['13.5', 'NOT_AS_DESCRIBED'],
  ['13.6', 'CREDIT_NOT_PROCESSED'],
  ['13.7', 'SUBSCRIPTION'],
  // Mastercard
  ['4837', 'FRAUD'],
  ['4853', 'PRODUCT_NOT_RECEIVED'],
  ['4855', 'PRODUCT_NOT_RECEIVED'],
  ['4859', 'SUBSCRIPTION'],
  ['4860', 'CREDIT_NOT_PROCESSED'],
  ['4863', 'FRAUD'],
]);

export function keywordMatch(text: string): Category | null {
  const lower = text.toLowerCase();
  if (/fraud|unauthorized|stolen|did not authorize/.test(lower)) return 'FRAUD';
  if (/not received|never received|didn't receive|not delivered/.test(lower)) return 'PRODUCT_NOT_RECEIVED';
  if (/not as described|defective|damaged|wrong item|misrepresented/.test(lower)) return 'NOT_AS_DESCRIBED';
  if (/duplicate|charged twice|double charge/.test(lower)) return 'DUPLICATE';
  if (/refund not|credit not|return not processed/.test(lower)) return 'CREDIT_NOT_PROCESSED';
  if (/subscription|recurring|cancel/.test(lower)) return 'SUBSCRIPTION';
  return null;
}
