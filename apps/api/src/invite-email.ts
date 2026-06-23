/**
 * Env-gated invitation email delivery.
 *
 * When SEARCHOPS_INVITE_EMAIL_WEBHOOK_URL is set, invite notifications are POSTed
 * to that endpoint (optionally bearer-authenticated) so an external relay can send
 * the actual email. When it is unset, the sender logs the invite (including the
 * accept token) to the server log so an operator can deliver it manually — the
 * invite system works without an email provider configured. A provider SDK
 * (Resend/SendGrid/SES) can later replace the webhook behind this same seam.
 */

export interface InviteEmailRequest {
  readonly to: string;
  readonly organizationId: string;
  readonly role: string;
  readonly token: string;
  readonly expiresAt: string;
  /** Absolute accept URL when SEARCHOPS_PUBLIC_APP_URL is configured; otherwise null. */
  readonly acceptUrl: string | null;
}

export interface InviteEmailSender {
  send(request: InviteEmailRequest): Promise<void>;
}

export interface CreateInviteEmailSenderOptions {
  readonly fetchImpl?: typeof fetch;
}

export function createInviteEmailSender(
  env: NodeJS.ProcessEnv,
  options: CreateInviteEmailSenderOptions = {},
): InviteEmailSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = env.SEARCHOPS_INVITE_EMAIL_WEBHOOK_URL?.trim();
  const token = env.SEARCHOPS_INVITE_EMAIL_WEBHOOK_TOKEN?.trim();

  if (!url) {
    return {
      async send(request) {
        console.log(
          "[invite-email] delivery not configured — invite for %s to org %s as %s (accept: %s)",
          request.to,
          request.organizationId,
          request.role,
          request.acceptUrl ?? `token=${request.token}`,
        );
      }
    };
  }

  return {
    async send(request) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) {
        headers.authorization = `Bearer ${token}`;
      }
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ kind: "searchops.invitation", ...request })
      });
      if (!response.ok) {
        throw new Error(`Invite email delivery failed with HTTP ${response.status}`);
      }
    }
  };
}
