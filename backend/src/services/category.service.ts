import { Category } from "../models/Category.js";


export async function getAllCategories(){
    const categories = await Category.findAll();

    return categories;
}