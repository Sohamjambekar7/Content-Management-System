
const express = require("express");
const multer = require("multer");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB for initial testing
  },
  fileFilter: (req, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.mimetype)) {
      return callback(
        new Error("Upload a JPG, PNG, or WebP image.")
      );
    }

    callback(null, true);
  }
});

const COMFYUI_URL =
  process.env.COMFYUI_URL || "http://127.0.0.1:8188";

// Check whether ComfyUI is running.
router.get("/status", async (req, res) => {
  try {
    const response = await fetch(
      `${COMFYUI_URL}/system_stats`
    );

    if (!response.ok) {
      return res.status(502).json({
        connected: false,
        message: "ComfyUI returned an error."
      });
    }

    res.json({
      connected: true,
      message: "CMS can reach ComfyUI."
    });
  } catch (error) {
    res.status(502).json({
      connected: false,
      message: "Cannot reach ComfyUI. Check that it is running."
    });
  }
});

// Initial upload endpoint.
// This validates the image but does not yet run an AI workflow.
router.post("/upload-test", (req, res) => {
  upload.single("image")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        error: error.message || "Upload failed."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Choose an image first."
      });
    }

    res.json({
      success: true,
      filename: req.file.originalname,
      size: req.file.size,
      message:
        "Image received by the CMS backend. Next, connect your ComfyUI workflow."
    });
  });
});

module.exports = router;
