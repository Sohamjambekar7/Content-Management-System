import { Request, Response } from 'express';
import { EditorProject } from '../models/EditorProject';
import { ExportHistory } from '../models/ExportHistory';

type AuthRequest = Request & { user?: { id: number } };
function userId(req: AuthRequest): number { return Number(req.user?.id); }
function validMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export async function listProjects(req: Request, res: Response): Promise<void> {
  const uid = userId(req as AuthRequest);
  const projects = await EditorProject.findAll({ where: { userId: uid }, order: [['updatedAt', 'DESC']], limit: 100 });
  res.json(projects);
}
export async function createProject(req: Request, res: Response): Promise<void> {
  const uid = userId(req as AuthRequest);
  const { name, mediaType } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 160 || !['photo', 'video'].includes(mediaType)) {
    res.status(400).json({ message: 'Provide a project name (max 160 characters) and mediaType photo or video.' }); return;
  }
  const project = await EditorProject.create({ userId: uid, name: name.trim(), mediaType, metadata: validMetadata(req.body.metadata) } as EditorProject);
  res.status(201).json(project);
}
export async function updateProject(req: Request, res: Response): Promise<void> {
  const uid = userId(req as AuthRequest);
  const project = await EditorProject.findOne({ where: { id: Number(req.params.id), userId: uid } });
  if (!project) { res.status(404).json({ message: 'Project not found.' }); return; }
  if (req.body.name !== undefined) {
    if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.trim().length > 160) { res.status(400).json({ message: 'Invalid project name.' }); return; }
    project.name = req.body.name.trim();
  }
  if (req.body.mediaType !== undefined) {
    if (!['photo', 'video'].includes(req.body.mediaType)) { res.status(400).json({ message: 'Invalid mediaType.' }); return; }
    project.mediaType = req.body.mediaType;
  }
  if (req.body.metadata !== undefined) project.metadata = validMetadata(req.body.metadata);
  await project.save(); res.json(project);
}
export async function createExport(req: Request, res: Response): Promise<void> {
  const uid = userId(req as AuthRequest);
  const { format, width, height, durationSeconds, platform, projectId } = req.body ?? {};
  if (typeof format !== 'string' || !/^[a-z0-9.+/-]{1,24}$/i.test(format)) { res.status(400).json({ message: 'A valid export format is required.' }); return; }
  let validProjectId: number | null = null;
  if (projectId !== undefined && projectId !== null) {
    const project = await EditorProject.findOne({ where: { id: Number(projectId), userId: uid } });
    if (!project) { res.status(400).json({ message: 'Project does not belong to this user.' }); return; }
    validProjectId = project.id;
  }
  const record = await ExportHistory.create({
    userId: uid, projectId: validProjectId, format,
    width: Number.isInteger(width) && width > 0 ? width : null,
    height: Number.isInteger(height) && height > 0 ? height : null,
    durationSeconds: typeof durationSeconds === 'number' && durationSeconds >= 0 ? durationSeconds : null,
    platform: typeof platform === 'string' ? platform.slice(0,40) : null,
    metadata: validMetadata(req.body.metadata)
  } as ExportHistory);
  res.status(201).json(record);
}
export async function listExports(req: Request, res: Response): Promise<void> {
  const records = await ExportHistory.findAll({ where: { userId: userId(req as AuthRequest) }, order: [['createdAt', 'DESC']], limit: 100 });
  res.json(records);
}
