import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { startSemanticRecordDocumentProvider } from "./seavt-document-provider.mjs";

/** The original loopback protocol, owned by the host's service lifetime. */
export const semanticRecordDocumentApplication = Object.freeze({
  kind: "metroplat.application/v1",
  operations: Object.freeze([]),
  factory({ configuration, services }) {
    if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)
      || Object.keys(configuration).some(key => !["root", "port"].includes(key))
      || typeof configuration.root !== "string" || !isAbsolute(configuration.root)
      || !Number.isSafeInteger(configuration.port) || configuration.port < 0 || configuration.port > 65535)
      throw new TypeError("the document application requires its absolute custody root and loopback port");
    const root = resolve(configuration.root), port = configuration.port;
    const identity = createHash("sha256").update(JSON.stringify([root, port])).digest("hex");
    services.ensure("seavt-documents." + identity, {
      start: () => startSemanticRecordDocumentProvider({ root, port }),
    });
    // This is a local capability, never a public entrance or a proxy route.
    return { resources: [] };
  },
});
