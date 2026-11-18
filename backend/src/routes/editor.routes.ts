import { Router } from 'express';
import { authenticateJWT } from '../shared/auth.util';
import {
  createExport,
  createProject,
  deleteProject,
  listExports,
  listProjects,
  updateProject,
} from '../controllers/editor.controller';

const router = Router();
router.use(authenticateJWT);
router.get('/projects', listProjects);
router.post('/projects', createProject);
router.patch('/projects/:id', updateProject);
router.delete('/projects/:id', deleteProject);
router.get('/exports', listExports);
router.post('/exports', createExport);

export default router;
