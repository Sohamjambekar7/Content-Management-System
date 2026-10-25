import type { Request, Response } from 'express';
import { z } from 'zod';
import { Category } from '../models/Category';
import { Post } from '../models/Post';
import { addCategory, deleteCategory, getAllCategories, getCategoryBySlug, updateCategory } from '../services/category.service';
import { generateSlug } from '../shared/general.util';
import { User } from '../models/User';

export const getCategories = async (req: Request, res: Response) => {
  const user = (req as Request & { user?: User }).user;
  const mine = req.query['mine'] === 'true';
  if (mine && !user) return res.status(401).json({ message: 'Authentication required.' });
  const categories = await getAllCategories(mine ? { userId: user!.get('id') } : undefined);
  return res.json(categories);
};

export const addCategoryController = async (req: Request, res: Response) => {
  const user = (req as Request & { user?: User }).user;
  if (!user) return res.status(401).json({ message: 'Authentication required.' });
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter a category name between 2 and 80 characters.' });
  const base = generateSlug(parsed.data.name);
  const slug = await getCategoryBySlug(base) ? generateSlug(parsed.data.name, true) : base;
  const category = await addCategory(parsed.data.name, slug, user.get('id'));
  return res.status(201).json(category);
};

export const deleteCategoryController = async (req: Request, res: Response) => {
  const user = (req as Request & { user?: User }).user;
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'A valid category id is required.' });
  const category = await Category.findByPk(parsed.data.id);
  if (!category) return res.status(404).json({ message: 'Category not found.' });
  if (category.userId !== user?.get('id')) return res.status(403).json({ message: 'You cannot delete this category.' });
  const hasPosts = await Post.count({ where: { categoryId: category.id } });
  if (hasPosts > 0) return res.status(409).json({ message: 'Move or delete posts in this category before deleting it.' });
  await deleteCategory(category.id);
  return res.status(200).json({ message: 'Category deleted.' });
};

export const getCategoryBySlugController = async (req: Request, res: Response) => {
  const category = await getCategoryBySlug(req.params.slug);
  if (!category) return res.status(404).json({ message: 'Category not found.' });
  return res.json(category);
};

export const updateCategoryController = async (req: Request, res: Response) => {
  const user = (req as Request & { user?: User }).user;
  const parsed = z.object({ id: z.coerce.number().int().positive(), name: z.string().trim().min(2).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'A valid id and category name are required.' });
  const category = await Category.findByPk(parsed.data.id);
  if (!category) return res.status(404).json({ message: 'Category not found.' });
  if (category.userId !== user?.get('id')) return res.status(403).json({ message: 'You cannot edit this category.' });
  let slug = generateSlug(parsed.data.name);
  const existing = await getCategoryBySlug(slug);
  if (existing && existing.id !== category.id) slug = generateSlug(parsed.data.name, true);
  const updated = await updateCategory(parsed.data.name, slug, category.id);
  return res.json(updated);
};
