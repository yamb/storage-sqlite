import { z } from 'zod';

export const ConfigSchema = z.strictObject({
  path: z.string().min(1),
  readonly: z.boolean().default(false)
});
