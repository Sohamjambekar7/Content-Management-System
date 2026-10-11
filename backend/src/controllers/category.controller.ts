import type { Request, Response } from "express"; 
import { addCategory, getAllCategories } from "../services/category.service.js";
import { Category } from "../models/Category";


export const getCategories = async(req: Request,res: Response)=>{

    const categories = await getAllCategories();
    res.json(categories)
}

export const addCategoryController = async(req: Request,res: Response)=>{

    const{name}= req.body;
    const userId=1;
    let slug = name.toLowerCase().replace(/\s+/g, '-');

    if (slug){
        // generate a unique slug
        // generate unique number to append with that slug
        const uniqueNumber = Math.floor(Math.random() * 1000);
        slug = `${slug}-${uniqueNumber}`;
    }
    const category =await addCategory(name,slug,userId);

    res.json(category)
    
}

export const deleteCategoryController = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        // Add your deletion logic here (e.g., Category.destroy)
        res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getCategoryBySlugController = async (req: Request, res: Response): Promise<void> => {
    try {
        const { slug } = req.params;
        const category = await Category.findOne({ where: { slug } });
        
        if (!category) {
            res.status(404).json({ error: "Category not found" });
            return;
        }
        
        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};

export const updateCategoryController = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        
        const category = await Category.findByPk(id);
        if (!category) {
            res.status(404).json({ error: "Category not found" });
            return;
        }

        const slug = name ? name.toLowerCase().replace(/\s+/g, '-') : category.slug;
        await category.update({ name, slug });
        
        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};