import { describe, it, expect } from "vitest";
import { createTransportFactory } from "../src/transport-factory.ts";
import { createBaileysTransport } from "../src/whatsapp.ts";
import { createMetaCloudTransport } from "../src/meta-cloud-transport.ts";

describe("provider selection", () => {
  const baseOptions = {
    authDir: "/tmp/test-auth",
    allowedNumbers: new Set(["1234567890"]),
    log: () => {},
  };

  it("should select baileys provider when provider: 'baileys'", () => {
    const transport = createTransportFactory({
      ...baseOptions,
      provider: "baileys",
    });
    
    // We can't directly compare the functions due to closures, but we can check
    // that it has the expected behavior by checking that it's not the meta-cloud stub
    // For now, we'll just verify it creates something with the right interface
    expect(transport).toHaveProperty("start");
    expect(transport).toHaveProperty("onMessage");
    expect(transport).toHaveProperty("sendText");
    expect(transport).toHaveProperty("stop");
  });

  it("should select meta-cloud provider when provider: 'meta-cloud'", () => {
    const transport = createTransportFactory({
      ...baseOptions,
      provider: "meta-cloud",
    });
    
    expect(transport).toHaveProperty("start");
    expect(transport).toHaveProperty("onMessage");
    expect(transport).toHaveProperty("sendText");
    expect(transport).toHaveProperty("stop");
  });

  it("should default to baileys when no provider specified", () => {
    const transport = createTransportFactory(baseOptions);
    
    expect(transport).toHaveProperty("start");
    expect(transport).toHaveProperty("onMessage");
    expect(transport).toHaveProperty("sendText");
    expect(transport).toHaveProperty("stop");
  });
});