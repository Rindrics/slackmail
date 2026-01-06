# ADR 006: Handle Slack Block Kit Character Limits with File Upload Fallback

## Status

Accepted

## Context

Emails forwarded to Slack are formatted using Block Kit (header, section blocks with text). However, Slack Block Kit has strict character limits that cause `invalid_blocks` errors when exceeded:

### The Problem

Production error encountered:
```text
Slack API error: slack_webapi_platform_error (actual: invalid_blocks)
Original message: An API error occurred: invalid_blocks
```

This occurs when:
- Email subject exceeds 150 characters (header block text limit)
- Email body exceeds 3000 characters (section block text limit)

### Slack Block Kit Limits

From Slack documentation:
- **Header block `text`**: Maximum 150 characters ([docs](https://docs.slack.dev/reference/block-kit/blocks/header-block/))
- **Section block `text`**: Maximum 3000 characters ([docs](https://docs.slack.dev/reference/block-kit/blocks/section-block/))
- **Section block `fields`**: Maximum 2000 characters per field

### Options Considered

1. **Truncate all content silently**: Simple but loses information
2. **Always send emails as files**: Consistent but poor UX for short emails
3. **Conditional file upload**: Normal blocks for short emails, files for long content - selected

## Decision

We will implement **conditional file upload** (Option 3):

### Approach

1. **Subject line (header block)**:
   - Limit: 140 characters (10-char safety margin)
   - If exceeded: Truncate to 137 characters + "..."
   - Rationale: Subject should always be visible in notification preview

2. **Email body (section block)**:
   - Limit: 2800 characters (200-char safety margin)
   - If exceeded: Upload full body as `.txt` file, show truncated preview in blocks
   - Rationale: Preserves full content while maintaining Slack UI for normal emails

3. **Safety margins**:
   - Use 140/2800 instead of actual limits (150/3000)
   - Prevents edge cases with Slack's internal formatting overhead
   - Emoji characters may count as multiple characters

### Implementation Details

**File upload strategy**:
- Use Slack `files.uploadV2` API
- Filename format: `email-body-{messageId}.txt`
- Upload file as a threaded reply using `thread_ts` parameter to avoid duplicate messages
- Include metadata fields (From/To/Subject) in blocks even when body is a file
- File contains full email body without truncation

**Message flow for long emails**:
1. Post main message with `chat.postMessage` (metadata + truncated preview)
2. Capture the returned `ts` (timestamp) from the posted message
3. Upload file with `files.uploadV2` using `thread_ts: ts` to attach as threaded reply

**Return value changes**:
```typescript
formatEmailForSlack(email: Email): {
  text: string;
  blocks: KnownBlock[];
  bodyAsFile?: { content: string; filename: string };
}
```

## Consequences

### Positive

- **No data loss**: Full email content always preserved (either in blocks or file)
- **Good UX for common case**: Short emails display normally without extra clicks
- **Clear debugging**: `invalid_blocks` errors eliminated
- **Future-proof**: Can adjust thresholds without architectural changes

### Negative

- **Complexity**: Two code paths (blocks vs. file upload)
- **File clutter**: Long emails create files in Slack workspace
- **Extra API call**: File uploads require separate `files.uploadV2` call

### Neutral

- Very long emails (3000+ chars) are rare in typical usage
- File upload adds minimal latency (~200-500ms) compared to failed retries

## References

- Issue: #44 - Cannot receive forwarded email
- Slack Block Kit documentation:
  - [Header block](https://docs.slack.dev/reference/block-kit/blocks/header-block/)
  - [Section block](https://docs.slack.dev/reference/block-kit/blocks/section-block/)
  - [Text object](https://docs.slack.dev/reference/block-kit/composition-objects/text-object/)
- Related Slack SDK issues:
  - [python-slack-sdk #1336](https://github.com/slackapi/python-slack-sdk/issues/1336)
  - [bolt-js #2509](https://github.com/slackapi/bolt-js/issues/2509)
