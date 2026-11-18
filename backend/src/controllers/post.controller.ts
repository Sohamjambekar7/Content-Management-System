import { Request, Response } from 'express';
import { z } from 'zod';
import {
  addPost,
  deletePost,
  getAllPosts,
  getPostById,
  getPostBySlug,
  updatePost,
} from '../services/post.service';
import { generateSlug } from '../shared/general.util';
import { getCategoryById } from '../services/category.service';
import { getTagsByIds } from '../services/tag.service';
import { addPostTags, deletePostTagRelations, getPostTags } from '../services/post-tag.service';
import { deletePostComments, getTotalCommentsByPostIds } from '../services/comment.service';
import { AuthRequest, parseWithSchema, requireAuthUser } from '../shared/http.util';

export const getAllPostsController = async (req: Request, res: Response) => {
  const safeData = parseWithSchema(
    z.object({
      categoryId: z.string().regex(/^\d+$/).optional(),
      tagId: z.string().regex(/^\d+$/).optional(),
      mine: z.enum(['true', 'false']).optional(),
    }),
    req.query,
    res
  );
  if (!safeData) return;

  const user = (req as AuthRequest).user;
  const { categoryId, tagId } = safeData;
  if (safeData.mine === 'true' && !user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const posts = await getAllPosts({
    categoryId: categoryId ? Number.parseInt(categoryId, 10) : undefined,
    tagId: tagId ? Number.parseInt(tagId, 10) : undefined,
    userId: safeData.mine === 'true' ? user?.get('id') : undefined,
  });

  const postIds = posts.map((post) => post.id);
  const totalCommentsByPostIds = await getTotalCommentsByPostIds(postIds);

  const postsWithTotalComments = posts.map((post) => {
    const totalComments = totalCommentsByPostIds.find(
      (entry) => entry.postId === post.id
    );
    return {
      ...post.toJSON(),
      totalComments: totalComments?.get('totalComments') || 0,
    };
  });

  return res.json(postsWithTotalComments);
};

export const addPostController = async (req: Request, res: Response) => {
  const user = requireAuthUser(req);
  const safeData = parseWithSchema(
    z.object({
      title: z.string().trim().min(3).max(180),
      content: z.string().trim().min(1).max(100000),
      categoryId: z.coerce.number().int().positive(),
      tagIds: z.array(z.coerce.number().int().positive()).optional(),
    }),
    req.body,
    res
  );
  if (!safeData) return;

  const { title, content, categoryId, tagIds } = safeData;
  const userId = user.get('id');

  const tagsValid = await validateTags(res, tagIds, userId);
  if (!tagsValid) return;

  let slug = generateSlug(title);
  if (await getPostBySlug(slug)) {
    slug = generateSlug(title, true);
  }

  const category = await getCategoryById(categoryId);
  if (!category) return res.status(400).json({ message: 'Invalid category id.' });
  if (category.userId !== userId) {
    return res.status(403).json({ message: 'Choose a category you own.' });
  }

  const post = await addPost(title, content, categoryId, userId, slug);
  if (tagIds && tagIds.length > 0) {
    await addPostTags(post.id, tagIds);
  }

  return res.status(201).json(post);
};

export const updatePostController = async (req: Request, res: Response) => {
  const user = requireAuthUser(req);
  const userId = user.get('id');

  const safeData = parseWithSchema(
    z.object({
      id: z.coerce.number().int().positive(),
      title: z.string().trim().min(3).max(180).optional(),
      content: z.string().trim().min(1).max(100000).optional(),
      categoryId: z.coerce.number().int().positive().optional(),
      tagIds: z.array(z.coerce.number().int().positive()).optional(),
    }),
    req.body,
    res
  );
  if (!safeData) return;

  let { id, title, content, categoryId, tagIds } = safeData;

  const post = await getPostById(id);
  const tagsValid = await validateTags(res, tagIds, userId);
  if (!tagsValid) return;

  if (!post) return res.status(404).json({ message: 'Post not found.' });
  if (post.userId !== userId) {
    return res.status(403).json({ message: 'You are not authorized to update this post.' });
  }

  if (categoryId) {
    const category = await getCategoryById(categoryId);
    if (!category) return res.status(400).json({ message: 'Invalid category id.' });
    if (category.userId !== userId) {
      return res.status(403).json({ message: 'Choose a category you own.' });
    }
  }

  let slug: string | undefined;
  if (title && title !== post.title) {
    slug = generateSlug(title);
    const existingSlug = await getPostBySlug(slug);
    if (existingSlug && existingSlug.id !== post.id) {
      slug = generateSlug(title, true);
    }
  }

  const updatedPost = await updatePost(id, title, content, categoryId, slug);
  const postTagRelations = await getPostTags(id);

  if (tagIds) {
    const tagIdsToDelete = postTagRelations.filter(
      (relation) => !tagIds?.includes(relation.tagId!)
    );
    await Promise.all(tagIdsToDelete.map((relation) => relation.destroy()));
  }

  if (tagIds && tagIds.length > 0) {
    const newTagIds = tagIds.filter(
      (tagId) => !postTagRelations.some((relation) => relation.tagId === tagId)
    );
    if (newTagIds.length > 0) {
      await addPostTags(post.id, newTagIds);
    }
  }

  return res.json(updatedPost);
};

export const deletePostController = async (req: Request, res: Response) => {
  const user = requireAuthUser(req);
  const userId = user.get('id');

  const safeData = parseWithSchema(
    z.object({ id: z.coerce.number().int().positive() }),
    req.body,
    res
  );
  if (!safeData) return;

  const { id } = safeData;
  const post = await getPostById(id);
  if (!post) return res.status(404).json({ message: 'Post not found.' });
  if (post.userId !== userId) {
    return res.status(403).json({ message: 'You are not authorized to delete this post.' });
  }

  await deletePostTagRelations({ postId: id });
  await deletePostComments(id);
  await deletePost(id);

  return res.json(post);
};

export const getPostBySlugController = async (req: Request, res: Response) => {
  const { slug } = req.params;
  if (!slug) return res.status(400).json({ message: 'Invalid slug.' });

  const post = await getPostBySlug(slug);
  if (!post) return res.status(404).json({ message: 'Post not found.' });

  return res.json(post);
};

async function validateTags(
  res: Response,
  tagIds?: number[],
  userId?: number
): Promise<boolean> {
  if (tagIds && tagIds.length > 0) {
    const tags = await getTagsByIds(tagIds);
    if (
      new Set(tagIds).size !== tagIds.length ||
      tags.length !== tagIds.length ||
      tags.some((tag) => tag.userId !== userId)
    ) {
      res.status(400).json({ message: 'Invalid tag id(s) or tag ownership.' });
      return false;
    }
  }
  return true;
}
