import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import multer from 'multer';

const router = Router();

// Ensure upload directory exists
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// POST /api/upload - Upload files for scanning
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.array('files', 1000), async (req: Request, res: Response) => {
  try {
    const files = req.files as any;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const scanId = crypto.randomUUID();
    const uploadDir = path.join(UPLOAD_DIR, scanId);
    fs.mkdirSync(uploadDir, { recursive: true });

    for (const file of files) {
      // file.originalname contains the relative path (e.g., folder/file.txt) if set by client
      const filePath = path.join(uploadDir, file.originalname);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, file.buffer);
    }

    // Return the target path as an absolute path that the worker can access
    const target = path.join(UPLOAD_DIR, scanId);
    res.json({ scanId, target, message: 'Upload successful' });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

export default router;
