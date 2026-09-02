import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuid } from 'uuid';
import path from 'path';
import { config } from '../config';

const s3 =
  config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY
    ? new S3Client({
        region: config.AWS_REGION,
        credentials: {
          accessKeyId: config.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        },
      })
    : null;

export const storageService = {
  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    if (!s3 || !config.AWS_BUCKET_NAME) {
      console.warn('[Storage] S3 not configured — returning mock URL.');
      return `https://mock-storage.local/${folder}/${file.originalname}`;
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const key = `${folder}/${uuid()}${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: config.AWS_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return `https://${config.AWS_BUCKET_NAME}.s3.${config.AWS_REGION}.amazonaws.com/${key}`;
  },

  async deleteFile(url: string): Promise<void> {
    if (!s3 || !config.AWS_BUCKET_NAME) return;
    const urlObj = new URL(url);
    const key = urlObj.pathname.slice(1); // remove leading /
    await s3.send(
      new DeleteObjectCommand({ Bucket: config.AWS_BUCKET_NAME, Key: key }),
    );
  },
};
