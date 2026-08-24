/**
 * A Workspace is a single sending identity/brand running on this CRM -- everything a workspace
 * owns (leads, campaigns, lead memory, errors, unknown senders, demos) is scoped to it by
 * `workspaceId`. Phase A introduces this model and migrates existing production data onto the
 * "biggbee" workspace; nothing here changes current behavior on its own.
 *
 * Never stores SMTP/IMAP credentials or any other secret -- smtpCredentialRef/imapCredentialRef
 * are references to n8n credential IDs, resolved only inside n8n's own node execution, matching
 * the existing WorkflowIntegration.authRef pattern (a reference to a name, never a value).
 */
export interface Workspace {
  /** Stable slug, e.g. "biggbee". Primary key -- every other workspace-scoped record references
   *  this, never the workspace's display name. */
  workspaceId: string;
  /** Internal label shown in the workspace switcher, e.g. "Biggbee AI". */
  workspaceName: string;
  /** The outbound email's `From` display name. */
  senderDisplayName: string;
  /** The outbound email's `From` address. */
  senderEmail: string;
  /** The outbound email's `Reply-To` address -- usually equals senderEmail, kept separate on
   *  purpose (e.g. a workspace that sends from one address but wants replies elsewhere). */
  replyToEmail: string;
  /** Where internal run-summary/error reports are sent for this workspace. */
  reportEmail: string;
  /** This workspace's public site, e.g. "https://www.biggbees.com". */
  website: string;
  /** Signature line name -- usually equals senderDisplayName, kept separate for a future
   *  "Sent by {person} @ {brand}" signature style. */
  signatureName: string;
  /** Signature line website -- usually equals website. */
  signatureWebsite: string;
  /** n8n credential ID for this workspace's SMTP mailbox. Never a password/host/user -- those
   *  live only inside the n8n credential itself. */
  smtpCredentialRef: string;
  /** n8n credential ID for this workspace's IMAP (reply) mailbox. */
  imapCredentialRef: string;
  /** Links to a Website Registry entry (src/types/website-registry.ts) -- this is the
   *  knowledge-base-per-brand mechanism; a workspace's outbound content is generated from this
   *  entry's crawled/cached content, never another workspace's. */
  websiteRegistryId: string;
  /** Extends the click-tracking redirect allowlist for this workspace's own domain(s), on top of
   *  the fixed res.cloudinary.com default. Empty/undefined is fine -- the redirect endpoint falls
   *  back to the global default list. */
  trackingLinkHosts?: string[];
  /** Optional brand logo, used in the outbound email signature. No logo is shown if unset --
   *  never falls back to another workspace's logo. */
  logoUrl?: string;
  timezone?: string;
  defaultCountry?: string;
  /** Deactivated workspaces are hidden from the switcher and rejected by ownership checks, never
   *  deleted -- same convention as every other "active" flag in this codebase. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The workspaceId every pre-Phase-A record migrates onto. Not a magic constant scattered through
 *  business logic -- referenced from exactly one place (the migration script and, until Phase B
 *  introduces a real session-resolved active workspace, the small set of server entry points that
 *  need a caller today). */
export const DEFAULT_WORKSPACE_ID = "biggbee";
