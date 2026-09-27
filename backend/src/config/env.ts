import 'dotenv/config'
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3333),
  
  DB_HOST: z.string(),
  PORT_DB: z.coerce.number().int().positive().max(65535),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_DATABASE: z.string(),
  
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
});

const _env = envSchema.safeParse(process.env);

if (_env.success === false) {
  console.error('❌ Invalid environment variables', _env.error.format());
  // Crash imediato da aplicação. Se o env tá errado, nada deve rodar.
  throw new Error('Invalid environment variables.');
}

export const env = {
  nodeEnv: _env.data.NODE_ENV,
  port: _env.data.PORT,
  dbHost: _env.data.DB_HOST,
  dbPort: _env.data.PORT_DB,
  dbUser: _env.data.DB_USER,
  dbPassword: _env.data.DB_PASSWORD,
  dbName: _env.data.DB_DATABASE,
  dbConnectionLimit: _env.data.DB_CONNECTION_LIMIT,
};
