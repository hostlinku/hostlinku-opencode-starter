import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const baseURL = "https://api.hostlinku.com/v1";
const isTokenLimit = (value) => Number.isSafeInteger(value) && value > 0;
const isPrice = (value) => Number.isFinite(value) && value >= 0;

export function buildConfig(catalog, defaultModel) {
  if (!Array.isArray(catalog?.data)) {
    throw new Error("Hostlinku did not return a model catalog.");
  }

  const models = Object.fromEntries(catalog.data.flatMap((item) => {
    const { id, capabilities, context_window, max_output_tokens, pricing } = item ?? {};
    if (typeof id !== "string" || !id || !Array.isArray(capabilities) ||
        !capabilities.includes("text") || !capabilities.includes("streaming") ||
        !isTokenLimit(context_window) || !isTokenLimit(max_output_tokens)) {
      return [];
    }

    const model = {
      name: typeof item.display_name === "string" && item.display_name ? item.display_name : id,
      limit: { context: context_window, output: max_output_tokens },
      tool_call: capabilities.includes("tool-calling") || capabilities.includes("function-calling"),
    };

    if (pricing?.unit === "1M_tokens" && pricing.currency === "USD" &&
        isPrice(pricing.input) && isPrice(pricing.output)) {
      model.cost = { input: pricing.input, output: pricing.output };
      for (const field of ["cache_read", "cache_write"]) {
        if (isPrice(pricing[field])) model.cost[field] = pricing[field];
      }
    }

    return [[id, model]];
  }));

  if (!Object.keys(models).length) {
    throw new Error("No text streaming models with published token limits were found for this API key.");
  }
  if (defaultModel !== undefined && !Object.hasOwn(models, defaultModel)) {
    throw new Error("The requested --model is not in the generated catalog. Run without --model to see available IDs.");
  }

  return {
    $schema: "https://opencode.ai/config.json",
    provider: {
      hostlinku: {
        npm: "@ai-sdk/openai-compatible",
        name: "Hostlinku",
        options: { baseURL, apiKey: "{env:HOSTLINKU_API_KEY}" },
        models,
      },
    },
    ...(defaultModel === undefined ? {} : { model: `hostlinku/${defaultModel}` }),
  };
}

export async function fetchCatalog(apiKey, fetcher = fetch) {
  if (!apiKey?.trim()) {
    throw new Error("Set HOSTLINKU_API_KEY before running the generator.");
  }

  let response;
  try {
    response = await fetcher(`${baseURL}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Could not reach the Hostlinku catalog over HTTPS.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`Hostlinku rejected the API key (HTTP ${response.status}). Check that it is active.`);
  }
  if (!response.ok) {
    throw new Error(`Hostlinku returned HTTP ${response.status} while fetching the catalog.`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error("Hostlinku did not return a JSON model catalog.");
  }
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: { help: { type: "boolean", short: "h" }, model: { type: "string" } },
    }));
  } catch {
    throw new Error("Invalid arguments. Run with --help for usage.");
  }

  if (values.help) {
    process.stdout.write(`Usage: node generate.mjs [--model HOSTLINKU_MODEL_ID]\n\nPrints an OpenCode V1 provider config for HOSTLINKU_API_KEY.\nPass --model to include an explicit default. No files are written.\n`);
    return;
  }

  const catalog = await fetchCatalog(process.env.HOSTLINKU_API_KEY);
  const config = buildConfig(catalog, values.model);
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
