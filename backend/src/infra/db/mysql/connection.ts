import mysql, { Pool } from "mysql2/promise";
import { env } from "../../../config/env";

export const db: Pool = mysql.createPool({
  host: env.dbHost,
  user: env.dbUser,
  password: env.dbPassword,
  database: env.dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});