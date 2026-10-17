#!/usr/bin/env node
/** Local durable witness-document provider for authenticated gateway consumers. */
import { parseArgs } from "node:util";
import { startJournalWitnessDocumentProviderProcess } from "../src/witness-journal-binding.mjs";

const { values } = parseArgs({
  options: { root: { type: "string" }, port: { type: "string" } },
});
if (!values.root) {
  process.stderr.write("usage: start-journal-witness-provider --root <systems-journal-root> [--port <local-port>]\n");
  process.exitCode = 2;
} else {
  const port = values.port === undefined ? 0 : Number(values.port);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
    throw new TypeError("port must be an integer from 0 to 65535");
  const provider = await startJournalWitnessDocumentProviderProcess({ root: values.root, port });
  process.stdout.write(JSON.stringify({
    manifest: "witness-journal-document.v1",
    baseUrl: provider.baseUrl,
    agentCardUrl: provider.agentCardUrl,
    bind: "127.0.0.1",
  }) + "\n");
}
