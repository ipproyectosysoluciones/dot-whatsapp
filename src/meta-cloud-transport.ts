import type { ChannelTransport, ChannelInbound } from "./whatsapp.ts";

/**
 * Creates a stub transport for Meta Cloud API provider.
 * This is a placeholder implementation that logs operations but doesn't actually
 * connect to the Meta Cloud API. The real implementation would use the official
 * WhatsApp Cloud API webhooks.
 */
export function createMetaCloudTransport(options: {
  authDir: string;
  allowedNumbers: Set<string>;
  log?(m: string): void;
}): ChannelTransport {
  const log = options.log ?? (() => {});
  let handler: ((message: ChannelInbound) => void) | undefined;

  log("[meta-cloud] Transport initialized (stub implementation)");

  return {
    onMessage(h) {
      handler = h;
      log("[meta-cloud] Message handler registered");
    },
    async start() {
      log("[meta-cloud] Transport started (stub)");
      // In a real implementation, this would:
      // 1. Set up webhook endpoint for receiving messages
      // 2. Configure the WhatsApp Business account via Cloud API
      // 3. Establish secure connection to Meta's servers
    },
    async sendText(toNumber: string, text: string): Promise<void> {
      log(`[meta-cloud] Would send text to ${toNumber}: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`);
      // In a real implementation, this would:
      // 1. Make HTTP POST to https://graph.facebook.com/v18.0/{phone-number-id}/messages
      // 2. With proper JSON payload and authentication
    },
    async stop() {
      log("[meta-cloud] Transport stopped (stub)");
      // In a real implementation, this would clean up webhook subscriptions
    },
  };
}