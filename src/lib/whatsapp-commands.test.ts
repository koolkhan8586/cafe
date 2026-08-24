import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  orderIdFromQuoted,
  parseWhatsAppCommand,
} from "./whatsapp-commands";

describe("parseWhatsAppCommand", () => {
  it("parses ACCEPT with an order number", () => {
    assert.deepEqual(parseWhatsAppCommand("ACCEPT 12"), {
      type: "accept",
      orderId: 12,
    });
    assert.deepEqual(parseWhatsAppCommand("accept #7"), {
      type: "accept",
      orderId: 7,
    });
    assert.deepEqual(parseWhatsAppCommand("✅ 3"), {
      type: "accept",
      orderId: 3,
    });
  });

  it("parses REJECT / CANCEL", () => {
    assert.deepEqual(parseWhatsAppCommand("REJECT 12"), {
      type: "reject",
      orderId: 12,
    });
    assert.deepEqual(parseWhatsAppCommand("cancel #4"), {
      type: "reject",
      orderId: 4,
    });
    assert.deepEqual(parseWhatsAppCommand("❌ 9"), {
      type: "reject",
      orderId: 9,
    });
  });

  it("parses COUNTER", () => {
    assert.deepEqual(parseWhatsAppCommand("COUNTER"), { type: "counter" });
    assert.deepEqual(parseWhatsAppCommand("open counter"), { type: "counter" });
    assert.deepEqual(parseWhatsAppCommand("board"), { type: "counter" });
  });

  it("uses the quoted order alert when the reply has no number", () => {
    const quoted = "*Cafe LSAF — New order #42*\n👤 Ammad";
    assert.deepEqual(parseWhatsAppCommand("ACCEPT", quoted), {
      type: "accept",
      orderId: 42,
    });
    assert.equal(orderIdFromQuoted(quoted), 42);
  });

  it("ignores unrelated chat", () => {
    assert.equal(parseWhatsAppCommand("hello"), null);
    assert.equal(parseWhatsAppCommand(""), null);
  });
});
