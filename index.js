import { Model, Plugin, Provider } from "@opencode/plugin";
import { buildConfig, fetchCatalog } from "./generate.mjs";

const id = "hostlinku";
const keyName = "HOSTLINKU_API_KEY";
const baseURL = "https://api.hostlinku.com/v1";
const compatiblePackage = "@opencode/ai/providers/openai-compatible";

function toModel(modelID, model, previous) {
  return {
    ...Model.Info.default(id, modelID),
    ...previous,
    name: model.name,
    limit: { ...model.limit, output: Math.min(model.limit.context, model.limit.output) },
    capabilities: {
      ...previous?.capabilities,
      tools: model.tool_call,
      input: previous?.capabilities.input ?? ["text"],
      output: previous?.capabilities.output ?? ["text"],
    },
    ...(model.cost && {
      cost: [{
        input: model.cost.input,
        output: model.cost.output,
        cache: { read: model.cost.cache_read ?? 0, write: model.cost.cache_write ?? 0 },
      }],
    }),
  };
}

function connectionID(connection) {
  if (!connection) return undefined;
  return connection.type === "credential" ? connection.id : `env:${connection.name}`;
}

export default Plugin.define({
  id: "hostlinku.catalog",
  async setup(ctx) {
    const controller = new AbortController();
    let snapshot;
    let revision = 0;

    await ctx.integration.transform((editor) => {
      editor.update(id, (integration) => { integration.name = "Hostlinku"; });
      editor.method.update({ integrationID: id, method: { type: "env", names: [keyName] } });
      editor.method.update({ integrationID: id, method: { type: "key", label: "Hostlinku API key" } });
    });

    await ctx.provider.transform((editor) => {
      const existing = editor.get(id);
      const provider = existing?.provider ?? Provider.Info.empty(id);
      // Replace the static inventory even while loading, so a switch cannot show another key's models.
      editor.add({
        info: {
          ...provider,
          name: "Hostlinku",
          integrationID: id,
          package: provider.package || compatiblePackage,
          settings: { ...provider.settings, baseURL },
        },
        models: Object.entries(snapshot?.models ?? {}).map(([modelID, model]) =>
          toModel(modelID, model, existing?.models.get(modelID)),
        ),
        sourceConnection: snapshot?.connection,
      });
    });

    async function refresh() {
      const request = ++revision;
      const connection = await ctx.integration.connection.active(id);
      const current = () => !controller.signal.aborted && request === revision;
      if (!current()) return;
      const sameConnection = snapshot && connectionID(snapshot.connection) === connectionID(connection);
      if (snapshot && !sameConnection) {
        snapshot = undefined;
        await ctx.provider.reload();
      }
      if (!connection) return;

      const credential = await ctx.integration.connection.resolve(connection);
      if (!current()) return;
      try {
        const models = credential?.type === "key"
          ? buildConfig(await fetchCatalog(credential.key)).provider.hostlinku.models
          : {};
        if (!current()) return;
        snapshot = { connection, models };
      } catch {
        if (!current()) return;
        // A failed refresh clears the inventory, including after an API key is revoked.
        snapshot = { connection, models: {} };
      }
      await ctx.provider.reload();
    }

    const refreshSafely = () => refresh().catch(() => {});
    const watch = async () => {
      for await (const event of ctx.event.subscribe({
        types: ["credential.updated", "credential.switched"],
        signal: controller.signal,
      })) {
        if (event.data.integrationID === id) void refreshSafely();
      }
    };
    void watch().catch(() => {});
    void refreshSafely();
    return () => controller.abort();
  },
});
