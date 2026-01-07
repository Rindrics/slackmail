import { describe, it, expect } from 'vitest';
import { generateEmailTemplate } from '@/presentation/emailTemplateGenerator';

describe('generateEmailTemplate', () => {
  it('should generate template with required fields', () => {
    const template = generateEmailTemplate();

    expect(template).toContain('To:');
    expect(template).toContain('From:');
    expect(template).toContain('Subject:');
    expect(template).toContain('(optional)');
  });

  it('should include blank line for body separator', () => {
    const template = generateEmailTemplate();
    const lines = template.split('\n');

    // Should have empty line after headers
    expect(lines).toContain('');
  });

  it('should have correct format', () => {
    const template = generateEmailTemplate();

    expect(template).toBe(`To:
From: (optional)
Subject:

`);
  });
});
