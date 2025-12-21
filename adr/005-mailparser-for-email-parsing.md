# ADR 005: Use mailparser for Email Parsing

## Status

Accepted

## Context

The application receives emails via SES and stores them in S3 as raw MIME format. The original `SimpleEmailParser` implementation manually parsed email headers and body by splitting on line breaks.

### Problem

When receiving emails from Gmail or other modern email clients, the body is typically sent as **MIME multipart** with both `text/plain` and `text/html` parts:

```text
--000000000000dd5c28064676401f
Content-Type: text/plain; charset="UTF-8"

hello

--000000000000dd5c28064676401f
Content-Type: text/html; charset="UTF-8"

<div dir="ltr">hello</div>

--000000000000dd5c28064676401f--
```

The simple parser displayed the raw MIME boundary markers instead of extracting the actual content.

### Requirements

- Parse MIME multipart messages correctly
- Extract both plain text and HTML body
- Handle various character encodings (UTF-8, ISO-8859-1, etc.)
- Support quoted-printable and base64 transfer encodings
- Parse complex email addresses with quoted display names

## Decision

Use the `mailparser` library for email parsing.

## Consequences

### Positive

- **RFC 5322 compliant**: Properly handles all standard email formats
- **MIME support**: Correctly parses multipart messages, extracting text and HTML
- **Encoding support**: Handles character encodings and transfer encodings
- **Battle-tested**: Widely used in production (2M+ weekly downloads)
- **Attachment support**: Can extract attachments if needed in the future

### Negative

- **Additional dependency**: Adds ~500KB to the bundle
- **Native dependencies**: `mailparser` uses `iconv-lite` which may have minor compatibility considerations

### Neutral

- The `EmailParser` interface remains unchanged; only the implementation changes
- Existing tests may need updates to reflect correct parsing behavior
