import type { ChannelTransport } from "./whatsapp.ts";
import { createBaileysTransport } from "./whatsapp.ts";
import { createMetaCloudTransport } from "./meta-cloud-transport.ts";

import type { MetaCloudConfig } from "./meta-cloud-transport.ts";

export type ProviderType = "baileys" | "meta-cloud";

export interface TransportFactoryOptions {
  authDir: string;
  allowedNumbers: Set<string>;
  log?(m: string): void;
  provider?: ProviderType;
  meta?: MetaCloudConfig | null;
}

/**
 * Factory function to create the appropriate ChannelTransport based on provider.
 * Defaults to "baileys" provider for backward compatibility.
 */
export function createTransportFactory(options: TransportFactoryOptions): ChannelTransport {
  const provider = options.provider ?? "baileys";
  
  switch (provider) {
    case "baileys":
      return createBaileysTransport(options);
    case "meta-cloud":
      return createMetaCloudTransport({
        authDir: options.authDir,
        allowedNumbers: options.allowedNumbers,
        log: options.log,
        meta: options.meta ?? undefined,
      });
    default:
      throw new Error(`Unknown provider: ${provider}. Supported providers: baileys, meta-cloud`);
  }
}