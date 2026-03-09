import 'dotenv/config'
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  
  DB_HOST: z.string(),
  PORT_DB: z.coerce.number(), // coerce converte string pra number automaticamente
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_DATABASE: z.string(),
  
  DB_CONNECTION_LIMIT: z.coerce.number().default(10),
});

const _env = envSchema.safeParse(process.env);

if (_env.success === false) {
  console.error('❌ Invalid environment variables', _env.error.format());
  // Crash imediato da aplicação. Se o env tá errado, nada deve rodar.
  throw new Error('Invalid environment variables.');
}

export const env = _env.data;