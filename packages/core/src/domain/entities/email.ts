export interface EmailAddress {
  name?: string;
  address: string;
}

export interface Email {
  messageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  body: {
    text?: string;
    html?: string;
  };
  date: Date;
  inReplyTo?: string;
  references?: string[];
}

export function createEmail(params: {
  messageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  body: { text?: string; html?: string };
  date: Date;
  inReplyTo?: string;
  references?: string[];
}): Email {
  return {
    messageId: params.messageId,
    from: params.from,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    replyTo: params.replyTo,
    subject: params.subject,
    body: params.body,
    date: params.date,
    inReplyTo: params.inReplyTo,
    references: params.references,
  };
}
