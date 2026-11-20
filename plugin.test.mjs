import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "./index.js";

function item(id, input = 0.4) {
  return {
    id,
    display_name: id,
    context_window: 131072,
    max_output_tokens: 8192,
    capabilities: ["text", "streaming", "tool-calling"],
    pricing: { input, output: 1.6, cache_read: 0.008, unit: "1M_tokens", currency: "USD" },
  };
}

test("replaces the static catalog, follows a new key, and clears rejected credentials", async () => {
  const first = { type: "credential", id: "dedicated" };
  let active = first;
  let providerTransform;
  const plainFetch = globalThis.fetch;
  let publish;
  const stream = new ReadableStream({ start(controller) { publish = controller; } });
  const notifications = [];
  let resolved;
  const nextReload = () => notifications.length ? Promise.resolve(notifications.shift()) :
    new Promise((resolve) => { resolved = resolve; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, auth: options.headers.Authorization });
    if (options.headers.Authorization === "Bearer rejected") return new Response(null, { status: 401 });
    const data = options.headers.Authorization === "Bearer dedicated"
      ? Array.from({ length: 7 }, (_, i) => item(`dedicated-${i}`))
      : [item("economy-0", 0.1)];
    return Response.json({ data });
  };
  const context = {
    integration: {
      transform(fn) { fn({ update() {}, method: { update() {} } }); },
      connection: { async active() { return active; }, async resolve(conn) { return { type: "key", key: conn.id }; } },
    },
    provider: {
      transform(fn) { providerTransform = fn; },
      reload() {
        let inventory;
        providerTransform({
          get: () => ({ provider: { id: "hostlinku" }, models: new Map([["static-only", {}]]) }),
          add: (value) => { inventory = value; },
        });
        if (resolved) { const resolve = resolved; resolved = undefined; resolve(inventory); }
        else notifications.push(inventory);
      },
    },
    event: { subscribe: () => stream },
  };
  let cleanup;
  try {
    cleanup = await plugin.setup(context);
    const dedicated = await nextReload();
    assert.equal(dedicated.models.length, 7);
    assert.equal(dedicated.sourceConnection, first);
    assert.equal(dedicated.models[0].cost[0].cache.read, 0.008);

    active = { type: "credential", id: "economy" };
    publish.enqueue({ data: { integrationID: "hostlinku" } });
    assert.deepEqual((await nextReload()).models, []);
    const economy = await nextReload();
    assert.deepEqual(economy.models.map((model) => [model.id, model.cost[0].input]), [["economy-0", 0.1]]);
    assert.equal(economy.sourceConnection, active);

    active = { type: "credential", id: "rejected" };
    publish.enqueue({ data: { integrationID: "hostlinku" } });
    await nextReload();
    assert.deepEqual((await nextReload()).models, []);
    assert.deepEqual(requests.map(({ url }) => url), Array(3).fill("https://api.hostlinku.com/v1/models"));
  } finally {
    cleanup?.();
    publish.close();
    globalThis.fetch = plainFetch;
  }
});
