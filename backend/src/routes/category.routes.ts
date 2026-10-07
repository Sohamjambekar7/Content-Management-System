import { Router } from "express";
import { getCategories } from "../controllers/category.controller.js";

const router = Router();

router.get('/',getCategories);
// router.get('/',addCategory);


export default router