import { Router } from "express";

import { MySqlProductRepository } from "../../infra/db/mysql/repositories/MySqlProductRepository";
import { MySqlStockMovementRepository } from "../../infra/db/mysql/repositories/MySqlStockMovementRepository";

import { ListProductsUseCase } from "../../application/use-cases/ListProductsUseCase";
import { GetProductDetailsUseCase } from "../../application/use-cases/GetProductDetailsUseCase";
import { CreateProductUseCase } from "../../application/use-cases/CreateProductUseCase";

import { ListProductsController } from "../controllers/ListProductsController";
import { GetProductDetailsController } from "../controllers/GetProductDetailsController";
import { CreateProductController } from "../controllers/CreateProductController";

import { AddStockEntryUseCase } from "../../application/use-cases/AddStockEntryUseCase";
import { AddStockExitUseCase } from "../../application/use-cases/AddStockExitUseCase";
import { ListProductMovementsUseCase } from "../../application/use-cases/ListProductMovementsUseCase";

import { AddStockEntryController } from "../controllers/AddStockEntryController";
import { AddStockExitController } from "../controllers/AddStockExitController";
import { ListProductMovementsController } from "../controllers/ListProductMovementsController";

const router = Router();

// --- Repositórios ---
const stockMovementRepository =
  new MySqlStockMovementRepository();

const productRepository =
  new MySqlProductRepository(stockMovementRepository);

// --- Use cases ---
const listProductsUseCase =
  new ListProductsUseCase(productRepository);

const getProductDetailsUseCase =
  new GetProductDetailsUseCase(productRepository);

const createProductUseCase = 
  new CreateProductUseCase(productRepository);

const addStockEntryUseCase = 
  new AddStockEntryUseCase(productRepository, stockMovementRepository);

const addStockExitUseCase = 
  new AddStockExitUseCase(productRepository, stockMovementRepository);

const listProductMovementsUseCase = 
  new ListProductMovementsUseCase(productRepository, stockMovementRepository);

// --- Controllers ---
const listProductsController =
  new ListProductsController(listProductsUseCase);

const getProductDetailsController =
  new GetProductDetailsController(getProductDetailsUseCase);

const createProductController =
  new CreateProductController(createProductUseCase);

const addStockEntryController =
  new AddStockEntryController (addStockEntryUseCase);

const addStockExitController =
  new AddStockExitController(addStockExitUseCase);

const listProductMovementsController =
  new ListProductMovementsController(listProductMovementsUseCase)

// --- Rotas ---
router.get(
  "/products",
  (req, res, next) => listProductsController.handle(req, res).catch(next)
);

router.get(
  "/products/:id",
  (req, res, next) => getProductDetailsController.handle(req, res).catch(next)
);

router.post(
  "/products",
  (req, res, next) => createProductController.handle(req, res).catch(next)
);

router.post(
  "/products/:id/stock/entry",
  (req, res, next) => addStockEntryController.handle(req, res).catch(next)
)

router.post(
  "/products/:id/stock/exit",
  (req, res, next) => addStockExitController.handle(req, res).catch(next)
)

router.get(
  "/products/:id/movements",
  (req, res, next) => listProductMovementsController.handle(req, res).catch(next)
)

export default router;
