// Shared shapes for the inbound email pipeline (Postmark webhook → thread
// store → entity link → extraction agent).

export type InboundStream = "manufacturing" | "wholesale";

export type PostmarkHeader = { Name?: string; Value?: string };

export type PostmarkAttachment = {
  Name?: string;
  Content?: string;
  ContentType?: string;
  ContentLength?: number;
};

export type PostmarkInbound = {
  MessageID?: string;
  From?: string;
  FromFull?: { Email?: string; Name?: string };
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Headers?: PostmarkHeader[];
  Attachments?: PostmarkAttachment[];
};

/** What we keep in inbound_messages.attachments after uploading to Storage. */
export type StoredAttachment = {
  name: string;
  content_type: string;
  size: number;
  /** Path inside the 'inbound-attachments' bucket; null if the upload failed. */
  storage_path: string | null;
};

export type MatchedEntityType = "manufacturing_run" | "purchase_order";

export type InboundMessageStatus =
  | "received"
  | "linked"
  | "applied"
  | "needs_review"
  | "failed"
  | "ignored";
