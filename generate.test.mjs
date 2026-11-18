import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig, fetchCatalog } from "./generate.mjs";

const chat = {
  id: "example-chat",
  display_name: "Example Chat",
  capabilities: ["text", "streaming", "tool-calling"],
  context_window: 128_000,
  max_output_tokens: 16_384,
  pricing: { unit: "1M_tokens", currency: "USD", input: 1, output: 3, cache_read: 0.1, cache_write: null },
};

test("requests only the authenticated Hostlinku catalog and does not export the key", async () => {
  const key = "fixture-key-not-a-secret";
  const catalog = await fetchCatalog(key, async (url, options) => {
    assert.equal(url, "https://api.hostlinku.com/v1/models");
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.redirect, "error");
    assert.equal(options.method ?? "GET", "GET");
    assert.equal(options.body, undefined);
    return Response.json({ data: [chat], service_mode: "economy" });
  });

  const config = buildConfig(catalog);
  assert.equal(config.provider.hostlinku.options.apiKey, "{env:HOSTLINKU_API_KEY}");
  assert.equal(config.model, undefined);
  assert.ok(!JSON.stringify(config).includes(key));
});

test("preserves limits and valid USD prices and omits non-streaming catalog entries", () => {
  const config = buildConfig({ data: [
    chat,
    { ...chat, id: "example-no-limit", max_output_tokens: null },
    { ...chat, id: "example-image", capabilities: ["image-generation"] },
    { ...chat, id: "example-other-currency", pricing: { ...chat.pricing, currency: "EUR" } },
  ] }, "example-chat");

  assert.equal(config.model, "hostlinku/example-chat");
  assert.deepEqual(Object.keys(config.provider.hostlinku.models), ["example-chat", "example-other-currency"]);
  assert.deepEqual(config.provider.hostlinku.models["example-chat"], {
    name: "Example Chat",
    limit: { context: 128_000, output: 16_384 },
    tool_call: true,
    cost: { input: 1, output: 3, cache_read: 0.1 },
  });
  assert.equal(config.provider.hostlinku.models["example-other-currency"].cost, undefined);
  assert.throws(() => buildConfig({ data: [chat] }, "other-mode-model"), /not in the generated catalog/);
});

test("auth errors omit the response body and credential", async () => {
  const key = "fixture-key-not-a-secret";
  await assert.rejects(fetchCatalog(key, async () => new Response(`No access for ${key}`, { status: 401 })), (error) => {
    assert.match(error.message, /HTTP 401/);
    assert.ok(!error.message.includes(key));
    return true;
  });
});
