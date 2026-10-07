import type { Request, Response } from "express"; 
import { getAllCategories } from "../services/category.service.js";

export const getCategories = async(req: Request,res: Response)=>{

    const categories = await getAllCategories();
    res.json(categories)
}