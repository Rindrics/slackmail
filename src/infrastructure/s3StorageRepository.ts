import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { StorageRepository } from '@/domain/repositories';

export class S3StorageRepository implements StorageRepository {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(bucket: string, client?: S3Client) {
    this.bucket = bucket;
    this.client = client ?? new S3Client();
  }

  async fetchRawEmail(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`Empty response body for key: ${key}`);
    }

    return response.Body.transformToString();
  }
}
