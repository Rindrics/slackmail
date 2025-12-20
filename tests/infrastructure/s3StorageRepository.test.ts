import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "node:stream";
import { sdkStreamMixin } from "@smithy/util-stream";
import { beforeEach, describe, expect, it } from "vitest";
import { S3StorageRepository } from "@/infrastructure";

const s3Mock = mockClient(S3Client);

describe("S3StorageRepository", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe("fetchRawEmail", () => {
    it("should fetch raw email content from S3", async () => {
      const rawEmail = "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nHello";

      const stream = sdkStreamMixin(Readable.from([rawEmail]));
      s3Mock.on(GetObjectCommand).resolves({
        Body: stream,
      });

      const repository = new S3StorageRepository("test-bucket");
      const result = await repository.fetchRawEmail("emails/test.eml");

      expect(result).toBe(rawEmail);

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toEqual({
        Bucket: "test-bucket",
        Key: "emails/test.eml",
      });
    });

    it("should throw error when response body is empty", async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: undefined,
      });

      const repository = new S3StorageRepository("test-bucket");

      await expect(repository.fetchRawEmail("emails/test.eml")).rejects.toThrow(
        "Empty response body for key: emails/test.eml"
      );
    });
  });
});
