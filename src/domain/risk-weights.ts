import type { Category } from './evidence-catalog.js';

export const BASE_SCORE: Record<Category, number> = {
  FRAUD: 55,
  NOT_AS_DESCRIBED: 45,
  SUBSCRIPTION: 40,
  PRODUCT_NOT_RECEIVED: 35,
  CREDIT_NOT_PROCESSED: 25,
  DUPLICATE: 15,
};

export const BASE_LOSS_PCT: Record<Category, number> = {
  FRAUD: 0.70,
  NOT_AS_DESCRIBED: 0.60,
  SUBSCRIPTION: 0.50,
  PRODUCT_NOT_RECEIVED: 0.45,
  CREDIT_NOT_PROCESSED: 0.30,
  DUPLICATE: 0.20,
};
