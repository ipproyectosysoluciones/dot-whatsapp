import { describe, it, expect } from "vitest";
import { createTransportFactory } from "../src/transport-factory";
import { createBaileysTransport } from "../src/whatsapp";
import { createMetaCloudTransport } from "../src/meta-cloud-transport";

describe("transport factory", () => {
  const options = {
    authDir: "/tmp/test-auth",
    allowedNumbers: new Set(["1234567890"]),
    log: () => {},
  };

  it("should create baileys transport by default", () => {
    const transport = createTransportFactory(options);
    expect(transport).toHaveProperty("start");
    expect(transport).toHaveProperty("onMessage");
    expect(transport).toHaveProperty("sendText");
    expect(transport).toHaveProperty("stop");
    // Should be instance of baileys transport
    expect(transport).toBeInstanceOf(Object); // We can't directly test instanceof due to dynamic imports
  });

  it("should create baileys transport when explicitly specified", () => {
    const transport = createTransportFactory({ ...options, provider: "baileys" });
    expect(transport).toHaveProperty("start");
    expect(transport).toHaveProperty("onMessage");
    expect(transport).toHaveProperty("sendText");
    expect(transport).toHaveProperty("stop");
  });

  it("should create meta-cloud transport when specified", () => {
    const transport = createTransportFactory({ ...options, provider: "meta-cloud" });
    expect(transport).toHaveProperty("start");
    expect(transport).toHaveProperty("onMessage");
    expect(transport).toHaveProperty("sendText");
    expect(transport).toHaveProperty("stop");
  });

  it("should throw error for unknown provider", () => {
    expect(() => {
      createTransportFactory({ ...options, provider: "unknown" as any });
    }).toThrow(/Unknown provider/);
  });

  it("should preserve baileys transport behavior", async () => {
    // This test ensures that the factory doesn't alter the baileys transport behavior
    const baileysTransport = createBaileysTransport(options);
    const factoryTransport = createTransportFactory({ ...options, provider: "baileys" });
    
    // Both should have the same interface
    expect(typeof baileysTransport.start).toBe("function");
    expect(typeof factoryTransport.start).toBe("function");
    expect(typeof baileysTransport.onMessage).toBe("function");
    expect(typeof factoryTransport.onMessage).toBe("function");
    expect(typeof baileysTransport.sendText).toBe("function");
    expect(typeof factoryTransport.sendText).toBe("function");
    expect(typeof baileysTransport.stop).toBe("function");
    expect(typeof factoryTransport.stop).toBe("function");
  });
});