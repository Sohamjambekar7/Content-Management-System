import { Request, Response } from 'express';
import { z } from 'zod';
import { getPostById } from '../services/post.service';
import {
  addComment,
  deleteComment,
  getCommentById,
  getCommentsForPostOwner,
  getPostComments,
  updateComment,
} from '../services/comment.service';
import { parseWithSchema, requireAuthUser } from '../shared/http.util';

export const getCommentsForOwnerController = async (req: Request, res: Response) => {
  const user = requireAuthUser(req);
  return res.json(await getCommentsForPostOwner(user.get('id')));
};

export const getPostCommentsController = async (req: Request, res: Response) => {
  const safeData = parseWithSchema(
    z.object({ postId: z.coerce.number().int().positive() }),
    { postId: req.params.postId },
    res
  );
  if (!safeData) return;

  const post = await getPostById(safeData.postId);
  if (!post) return res.status(404).json({ message: 'Post not found.' });

  const comments = await getPostComments(safeData.postId);
  return res.json(comments);
};

export const addCommentController = async (req: Request, res: Response) => {
  const user = requireAuthUser(req);
  const safeData = parseWithSchema(
    z.object({
      postId: z.coerce.number().int().positive(),
      content: z.string().trim().min(1).max(2000),
    }),
    req.body,
    res
  );
  if (!safeData) return;

  const post = await getPostById(safeData.postId);
  if (!post) return res.status(404).json({ message: 'Post not found.' });

  const comment = await addComment(safeData.postId, user.get('id'), safeData.content);
  return res.status(201).json(comment);
};

export const updateCommentController = async (req: Request, res: Response) => {
  const user = requireAuthUser(req);
  const safeData = parseWithSchema(
    z.object({
      commentId: z.coerce.number().int().positive(),
      content: z.string().trim().min(1).max(2000),
    }),
    req.body,
    res
  );
  if (!safeData) return;

  const comment = await getCommentById(safeData.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found.' });
  if (comment.userId !== user.get('id')) {
    return res.status(403).json({ message: 'You are not the owner of this comment.' });
  }

  const updatedComment = await updateComment(safeData.commentId, safeData.content);
  return res.json(updatedComment);
};

export const deleteCommentController = async (req: Request, res: Response) => {
  const user = requireAuthUser(req);
  const safeData = parseWithSchema(
    z.object({ commentId: z.coerce.number().int().positive() }),
    req.body,
    res
  );
  if (!safeData) return;

  const userId = user.get('id');
  const comment = await getCommentById(safeData.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found.' });

  const post = await getPostById(comment.postId!);
  if (comment.userId !== userId && post?.userId !== userId) {
    return res.status(403).json({ message: 'You are not allowed to delete this comment.' });
  }

  await deleteComment(safeData.commentId);
  return res.json(comment);
};
