import { Request, Response } from 'express';
import { z } from 'zod';
import {
  addTag,
  deleteTag,
  getAllTags,
  getTagById,
  getTagBySlug,
} from '../services/tag.service';
import { generateSlug } from '../shared/general.util';
import { getPostById } from '../services/post.service';
import { deletePostTagRelations, getPostTags } from '../services/post-tag.service';
import { AuthRequest, parseWithSchema, requireAuthUser } from '../shared/http.util';

export const getTagsController = async (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const mine = req.query['mine'] === 'true';
  if (mine && !user) return res.status(401).json({ message: 'Authentication required.' });
  const tags = await getAllTags(mine ? { userId: user!.get('id') } : undefined);
  return res.json(tags);
};

export const addTagController = async (req: Request, res: Response) => {
  const user = requireAuthUser(req);
  const safeData = parseWithSchema(
    z.object({ name: z.string().trim().min(1).max(60) }),
    req.body,
    res
  );
  if (!safeData) return;

  const { name } = safeData;
  let slug = generateSlug(name);
  if (await getTagBySlug(slug)) {
    slug = generateSlug(name, true);
  }

  const newTag = await addTag(name, slug, user.get('id'));
  return res.status(201).json(newTag);
};

export const updateTagController = async (req: Request, res: Response) => {
  const user = requireAuthUser(req);
  const safeData = parseWithSchema(
    z.object({
      name: z.string().trim().min(1).max(60),
      id: z.coerce.number().int().positive(),
    }),
    req.body,
    res
  );
  if (!safeData) return;

  const { name, id } = safeData;
  const tag = await getTagById(id);

  if (!tag) return res.status(404).json({ message: 'Tag not found.' });
  if (tag.userId !== user.get('id')) return res.status(403).json({ message: 'You cannot edit this tag.' });
  if (tag.name === name) return res.status(400).json({ message: 'Nothing was changed.' });

  let slug = generateSlug(name);
  const existing = await getTagBySlug(slug);
  if (existing && existing.id !== tag.id) {
    slug = generateSlug(name, true);
  }

  tag.name = name;
  tag.slug = slug;
  await tag.save();

  return res.json(tag);
};

export const deleteTagController = async (req: Request, res: Response) => {
  const user = requireAuthUser(req);
  const safeData = parseWithSchema(
    z.object({ id: z.coerce.number().int().positive() }),
    req.body,
    res
  );
  if (!safeData) return;

  const tag = await getTagById(safeData.id);
  if (!tag) return res.status(404).json({ message: 'Tag not found.' });
  if (tag.userId !== user.get('id')) return res.status(403).json({ message: 'You cannot delete this tag.' });

  await deletePostTagRelations({ tagId: safeData.id });
  await deleteTag(safeData.id);

  return res.json(tag);
};

export const getPostTagsController = async (req: Request, res: Response) => {
  const safeData = parseWithSchema(
    z.object({ postId: z.coerce.number().int().positive() }),
    { postId: req.params.postId },
    res
  );
  if (!safeData) return;

  const post = await getPostById(safeData.postId);
  if (!post) return res.status(404).json({ message: 'Post not found.' });

  const postTags = await getPostTags(safeData.postId);
  return res.json(postTags);
};

export const getTagBySlugController = async (req: Request, res: Response) => {
  const { slug } = req.params;
  const tag = await getTagBySlug(slug);
  if (!tag) return res.status(404).json({ message: 'Tag not found.' });
  return res.json(tag);
};
