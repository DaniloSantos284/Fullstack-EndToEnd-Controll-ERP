import mysql, { Pool } from "mysql2/promise";
import { env } from "../../../config/env";

export const db: Pool = mysql.createPool({
  host: env.dbHost,
  user: env.dbUser,
  password: env.dbPassword,
  database: env.dbName,
  port: env.dbPort,
  waitForConnections: true,
  connectionLimit: env.dbConnectionLimit,
  queueLimit: 0,
  decimalNumbers: true,
  charset: "utf8mb4",
  timezone: "Z",
});
