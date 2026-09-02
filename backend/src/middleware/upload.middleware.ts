import multer from 'multer';
import { Request } from 'express';
import { AppError } from '../utils/errors';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    return cb(
      new AppError(
        'Invalid file type. Allowed: JPEG, PNG, GIF, WEBP, PDF, MP4, MOV, WEBM.',
        400,
      ) as unknown as null,
      false,
    );
  }
  // Sanitise filename — keep only safe chars
  file.originalname = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  cb(null, true);
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter,
});
