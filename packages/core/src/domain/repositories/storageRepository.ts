/**
 * Repository interface for fetching raw email data from storage.
 * Implementations can be S3, local filesystem, or any other storage backend.
 */
export interface StorageRepository {
  /**
   * Fetch raw email content from storage.
   * @param key - The storage key (e.g., S3 object key)
   * @returns The raw email content as a string
   */
  fetchRawEmail(key: string): Promise<string>;
}
