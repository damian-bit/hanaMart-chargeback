import "dotenv/config";
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string(),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default('info'),
});

export const env = schema.parse(process.env);
