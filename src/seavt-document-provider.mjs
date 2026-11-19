import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/computer-code-engine/semiotic-expression-notation/semantic-content-identity";
import { startSeavtDocumentHttpProvider } from "@red-cup-engineering/semiotic-eavt-engineering-services-section/documents/http";
import { openSeavtDocumentStore } from "@red-cup-engineering/semiotic-eavt-engineering-services-section/documents/store";
import { createSemanticRecordJournal } from "./index.mjs";

const sourceKinds = new Set(["witness-journal.document", "witness-journal.batch-receipt"]);

/** Read the original semantic-record feeds when a document predates the SEAVT store. */
function originalDocumentBinding(root) {
  const log = createSemanticRecordJournal({ root, objectKind: "witness-journal" });
  const records = category => log.query({ category }).map(row => row.record);
  return {
    custody: {
      async get(reference) {
        const ni = typeof reference === "string" ? reference : reference.ni;
        const matches = records("custodiedObject").filter(record => record.ni === ni);
        if (matches.length === 0) return null;
        if (matches.length > 1) throw new TypeError("duplicate original document identity");
        const [record] = matches;
        if (record.type !== "WitnessJournalObject" || record.version !== 1 || !sourceKinds.has(record.kind)) {
          throw new TypeError("foreign original document record");
        }
        const object = identifyJsonSemanticContent({ objectKind: record.kind, value: record.value, witnessRoot: EMPTY_WITNESS_ROOT });
        if (object.token !== ni) throw new TypeError("original document identity mismatch");
        return Object.freeze({ ni, bytes: object.bytes, mediaType: record.mediaType });
      },
    },
    categoryIndex: {
      async query(category, { predicate }) {
        const references = records("categoryReference")
          .filter(record => record.type === "WitnessJournalCategoryReference" && record.version === 1 &&
            record.predicate === predicate && record.category === category)
          .map(({ ni }) => ({ ni }));
        return { references };
      },
    },
  };
}

export async function startSemanticRecordDocumentProvider({ root, port } = {}) {
  const binding = await openSeavtDocumentStore(root, { legacy: originalDocumentBinding(root) });
  return startSeavtDocumentHttpProvider(binding, { host: "127.0.0.1", port });
}
