import express from "express";
import path from "path";
import productsRoutes from "./http/routes/products.routes";
import { errorHandler } from "./http/middlewares/errorHandler";

const app = express();

// Middleware para JSON
app.use(express.json());

// Arquivos estáticos (uploads)
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "uploads"))
);

// Rotas
app.use("/api", productsRoutes);

// Middleware global de erro
app.use(errorHandler);

export { app };
