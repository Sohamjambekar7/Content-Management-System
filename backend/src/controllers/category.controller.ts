import type { Request, Response } from "express"; 
import { addCategory, getAllCategories } from "../services/category.service.js";

export const getCategories = async(req: Request,res: Response)=>{

    const categories = await getAllCategories();
    res.json(categories)
}

export const addCategoryController = async(req: Request,res: Response)=>{

    const{name}= req.body;
    const userId=1;
    const slug = name.toLowerCase().replace(' ', '-');

    if (slug){
        // generate a unique slug
        // generate uniwue number to append with that slug
        let uniqueNumber = Math.floor(Math.random()=1000);
        slug = slug + '-' + uniqueNumber;

    }
    const category =await addCategory(name,slug,userId);

    res.json(category)
    
}