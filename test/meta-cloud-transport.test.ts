import { describe, it, expect, vi } from "vitest";
import { createMetaCloudTransport } from "../src/meta-cloud-transport";

describe("meta-cloud transport", () => {
  const options = {
    authDir: "/tmp/test-auth",
    allowedNumbers: new Set(["1234567890"]),
    log: vi.fn(),
  };

  it("should create meta-cloud transport with correct interface", () => {
    const transport = createMetaCloudTransport(options);
    expect(transport).toHaveProperty("start");
    expect(transport).toHaveProperty("onMessage");
    expect(transport).toHaveProperty("sendText");
    expect(transport).toHaveProperty("stop");
    
    expect(typeof transport.start).toBe("function");
    expect(typeof transport.onMessage).toBe("function");
    expect(typeof transport.sendText).toBe("function");
    expect(typeof transport.stop).toBe("function");
  });

  it("should log initialization", async () => {
    const logMock = vi.fn();
    const transport = createMetaCloudTransport({
      ...options,
      log: logMock,
    });
    
    expect(logMock).toHaveBeenCalledWith(
      "[meta-cloud] Transport initialized (stub implementation)"
    );
  });

  it("should log when start is called", async () => {
    const logMock = vi.fn();
    const transport = createMetaCloudTransport({
      ...options,
      log: logMock,
    });
    
    await transport.start();
    expect(logMock).toHaveBeenCalledWith(
      "[meta-cloud] Transport started (stub)"
    );
  });

  it("should log when sendText is called", async () => {
    const logMock = vi.fn();
    const transport = createMetaCloudTransport({
      ...options,
      log: logMock,
    });
    
    await transport.sendText("1234567890", "Hello world");
    expect(logMock).toHaveBeenCalledWith(
      "[meta-cloud] Would send text to 1234567890: \"Hello world\""
    );
  });

  it("should log when stop is called", async () => {
    const logMock = vi.fn();
    const transport = createMetaCloudTransport({
      ...options,
      log: logMock,
    });
    
    await transport.stop();
    expect(logMock).toHaveBeenCalledWith(
      "[meta-cloud] Transport stopped (stub)"
    );
  });

  it("should register message handler", () => {
    const logMock = vi.fn();
    const transport = createMetaCloudTransport({
      ...options,
      log: logMock,
    });
    
    const handler = vi.fn();
    transport.onMessage(handler);
    
    expect(logMock).toHaveBeenCalledWith(
      "[meta-cloud] Message handler registered"
    );
    // We can't easily test that the handler is stored without accessing internals,
    // but at least we know the method doesn't throw
  });
});