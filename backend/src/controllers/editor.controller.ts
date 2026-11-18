import { Request, Response } from 'express';
import { z } from 'zod';
import { EditorProject } from '../models/EditorProject';
import { ExportHistory } from '../models/ExportHistory';
import { AppError, parseWithSchema, requireAuthUser } from '../shared/http.util';

const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.').max(160),
  mediaType: z.enum(['photo', 'video']),
  metadata: z.record(z.unknown()).optional().default({}),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  mediaType: z.enum(['photo', 'video']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createExportSchema = z.object({
  format: z
    .string()
    .trim()
    .regex(/^[a-z0-9.+/-]{1,24}$/i, 'A valid export format is required.'),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  durationSeconds: z.coerce.number().min(0).optional(),
  platform: z.string().trim().max(40).optional(),
  projectId: z.coerce.number().int().positive().nullable().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export async function listProjects(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const projects = await EditorProject.findAll({
    where: { userId: user.id! },
    order: [['updatedAt', 'DESC']],
    limit: 100,
  });
  res.json(projects);
}

export async function createProject(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const parsed = parseWithSchema(createProjectSchema, req.body, res);
  if (!parsed) return;

  const project = await EditorProject.create({
    userId: user.id!,
    name: parsed.name,
    mediaType: parsed.mediaType,
    metadata: parsed.metadata,
  } as EditorProject);
  res.status(201).json(project);
}

export async function updateProject(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new AppError(400, 'Invalid project id.', 'INVALID_ID');
  }

  const parsed = parseWithSchema(updateProjectSchema, req.body, res);
  if (!parsed) return;

  const project = await EditorProject.findOne({ where: { id: projectId, userId: user.id! } });
  if (!project) {
    throw new AppError(404, 'Project not found.', 'PROJECT_NOT_FOUND');
  }

  if (parsed.name !== undefined) project.name = parsed.name;
  if (parsed.mediaType !== undefined) project.mediaType = parsed.mediaType;
  if (parsed.metadata !== undefined) project.metadata = parsed.metadata;

  await project.save();
  res.json(project);
}

export async function deleteProject(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new AppError(400, 'Invalid project id.', 'INVALID_ID');
  }

  const project = await EditorProject.findOne({ where: { id: projectId, userId: user.id! } });
  if (!project) {
    throw new AppError(404, 'Project not found.', 'PROJECT_NOT_FOUND');
  }

  await project.destroy();
  res.json({ success: true, message: 'Project deleted.' });
}

export async function createExport(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const parsed = parseWithSchema(createExportSchema, req.body, res);
  if (!parsed) return;

  let validProjectId: number | null = null;
  if (parsed.projectId) {
    const project = await EditorProject.findOne({
      where: { id: parsed.projectId, userId: user.id! },
    });
    if (!project) {
      throw new AppError(400, 'Project does not belong to this user.', 'INVALID_PROJECT');
    }
    validProjectId = project.id;
  }

  const record = await ExportHistory.create({
    userId: user.id!,
    projectId: validProjectId,
    format: parsed.format,
    width: parsed.width,
    height: parsed.height,
    durationSeconds: parsed.durationSeconds,
    platform: parsed.platform,
    metadata: parsed.metadata,
  } as ExportHistory);
  res.status(201).json(record);
}

export async function listExports(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const records = await ExportHistory.findAll({
    where: { userId: user.id! },
    order: [['createdAt', 'DESC']],
    limit: 100,
  });
  res.json(records);
}
