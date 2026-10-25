import { Router } from "express";
import {
  addCommentController,
  deleteCommentController,
  getCommentsForOwnerController,
  getPostCommentsController,
  updateCommentController,
} from "../controllers/comment.controller";
import { authenticateJWT } from "../shared/auth.util";

const router = Router();

router.get('/', authenticateJWT, getCommentsForOwnerController);
router.get("/:postId", getPostCommentsController);
router.post("/", authenticateJWT, addCommentController);
router.put("/", authenticateJWT, updateCommentController);
router.delete("/", authenticateJWT, deleteCommentController);

export default router;
