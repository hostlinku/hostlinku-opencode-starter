# Hostlinku OpenCode Starter

Use Hostlinku in OpenCode with the models, token limits, and USD prices available to your API key. Each key is tied to Economy, Performance, or Dedicated.

## OpenCode 2 plugin

In OpenCode **2.3.2**, install the [GitHub release](https://github.com/hostlinku/hostlinku-opencode-starter/releases/tag/v0.1.0):

```sh
opencode plugin add github:hostlinku/hostlinku-opencode-starter#v0.1.0
```

Open `/connect`, select **Hostlinku**, and enter your Hostlinku API key. You can also start OpenCode with `HOSTLINKU_API_KEY` in its environment. The plugin reloads the catalog when you connect or switch keys. If you already use a generated Hostlinku config, remove its `provider.hostlinku` entry before enabling the plugin. Other provider settings can stay in place.

The plugin uses Chat Completions by default and reads the catalog over HTTPS from `api.hostlinku.com`. You can use `opencode models` to check the model list. If the catalog is temporarily unavailable, run `opencode reload` after service recovers.

## Configuration generator for OpenCode 1

The generator writes an OpenCode V1 provider configuration to stdout. The same configuration works using [OpenCode V2 compatibility](https://opencode.ai/docs/migrate-v1/#use-your-existing-configuration).

1. Install [Node.js](https://nodejs.org/) 22 or newer and [OpenCode](https://opencode.ai/). Create an API key in the [Hostlinku Console](https://console.hostlinku.com/) for your preferred service mode.
2. Set `HOSTLINKU_API_KEY` in your local environment. From this repository, run:

   ```sh
   node generate.mjs
   ```

3. Review the JSON. If you already have an `opencode.json` or `opencode.jsonc`, merge `provider.hostlinku` into its existing `provider` object. For a fresh setup, save the JSON as `opencode.json` at your project's root. See [OpenCode config locations](https://opencode.ai/docs/config/#locations) for other options. If you already defined a Hostlinku provider in native V2 format, use one Hostlinku definition and check the [migration guide](https://opencode.ai/docs/migrate-v1/#providers).
4. Launch OpenCode from a terminal that has `HOSTLINKU_API_KEY` set. Use `/models` in the terminal UI or open the Desktop model picker, then choose a model under **Hostlinku**. For Desktop, make sure the application process can also read the variable. See the [Hostlinku OpenCode guide](https://docs.hostlinku.com/integrations/opencode) for the private file alternative.

To add an explicit project default, pass the model ID you found in the output:

```sh
node generate.mjs --model claude-sonnet-4-6
```

The example slug only works when it is available for your key. If you change your key's service mode, generate a fresh config with the new key and replace the old Hostlinku provider entry. You can use the same command to refresh model limits and prices as the catalog changes.

## What the generator does

- Reads [GET `/v1/models`](https://docs.hostlinku.com/models) from Hostlinku. It makes one catalog request, sends no prompts, and writes no files. Choosing a model and sending a prompt in OpenCode uses your Hostlinku balance.
- Includes text models that advertise streaming and publish both token limits. It copies catalog prices when provided in USD per million tokens. Prices are a snapshot for OpenCode display. Check Hostlinku Console for actual charges and use the catalog for updated prices.
- Emits an environment variable reference (`{env:HOSTLINKU_API_KEY}`) and never inserts the actual key. Keep the key local and use the same key in OpenCode that you used to generate its model list.
- Configures a custom provider using the OpenAI-compatible Chat Completions endpoint. Support for specific tools and parameters depends on the model and endpoint. The starter does not add a built-in listing to OpenCode Integrations.

Run the local checks with no API key:

```sh
npm ci
node --test
```

## Bahasa Indonesia

Di OpenCode 2.3.2, pasang plugin dari GitHub lalu pilih **Hostlinku** di `/connect`. Daftar model dan harga diperbarui saat kamu mengganti key. Di OpenCode 1, atur `HOSTLINKU_API_KEY`, jalankan `node generate.mjs`, dan gabungkan `provider.hostlinku` ke `opencode.json`. Buka OpenCode dengan variabel yang sama, lalu pilih model Hostlinku. Panduan tambahan ada di [dokumentasi Hostlinku](https://docs.hostlinku.com/integrations/opencode).
