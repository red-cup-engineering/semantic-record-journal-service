/**
 * Durable witness-document custody over the ONE semantic-record journal.
 *
 * This is a Systems composition of the existing Data witness-document
 * {custody, categoryIndex} protocol; it is not another document codec,
 * hashing algorithm, journal, graph, or truth/authority decision.
 * Supplying an optional original legacy binding gives read-through only:
 * neither opening the journal nor a failed read migrates or deletes sources.
 */
import {
  admitJsonSemanticContent,
  EMPTY_WITNESS_ROOT,
  identifyJsonSemanticContent,
} from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/semantic-content-identity";
import { createSemanticRecordJournal } from "./index.mjs";

const JOURNAL_KIND = "witness-journal";
const DOCUMENT_KIND = "witness-journal.document";
const RECEIPT_KIND = "witness-journal.batch-receipt";
const OBJECT_CATEGORY = "custodiedObject";
const REFERENCE_CATEGORY = "categoryReference";
const CATEGORY_PREDICATE = "urn:emsenn:witness-journal:category";
const PROFILE = "org.red-cup-engineering.semantic-record-witness-document.v1";
const HELD = Object.freeze({ support: true, refutation: false });

function required(value, field) {
  if (typeof value !== "string" || !value.length) throw new TypeError("witness journal " + field + " must be nonempty text");
  return value;
}
function sourceTime(now) {
  const time = now();
  if (!(time instanceof Date) || !Number.isFinite(time.valueOf())) throw new TypeError("witness journal clock must return a valid Date");
  return time.toISOString();
}
function decodeObject(ni, bytes) {
  for (const kind of [DOCUMENT_KIND, RECEIPT_KIND]) {
    try { return Object.freeze({ kind, value: admitJsonSemanticContent({ token: ni, bytes, objectKind: kind }).value }); }
    catch { /* A different kind, or an invalid commitment. Neither is accepted. */ }
  }
  throw new TypeError("witness journal custody requires an addressed document or batch receipt");
}
function restoredObject(record) {
  if (!record || record.type !== "WitnessJournalObject" || record.version !== 1) throw new TypeError("foreign witness journal object");
  const identified = identifyJsonSemanticContent({ objectKind: record.kind, value: record.value, witnessRoot: EMPTY_WITNESS_ROOT });
  if (identified.token !== record.ni || ![DOCUMENT_KIND, RECEIPT_KIND].includes(record.kind))
    throw new TypeError("witness journal object identity mismatch");
  return Object.freeze({ ni: record.ni, kind: record.kind, mediaType: record.mediaType, bytes: identified.bytes });
}

/**
 * Compose the native Systems journal with the existing Data document API.
 * Repeated puts/links are idempotent; two different objects cannot own one
 * NI. A historical binding may be read but is never changed or auto-migrated.
 * The caller must explicitly supply a persistent root and durable clock.
 */
export function createJournalWitnessDocumentBinding({ root, legacy, now = () => new Date() } = {}) {
  required(root, "root");
  if (typeof now !== "function") throw new TypeError("witness journal clock must be a function");
  if (legacy !== undefined &&
    (typeof legacy?.custody?.get !== "function" || typeof legacy?.categoryIndex?.query !== "function"))
    throw new TypeError("legacy witness journal requires custody.get and categoryIndex.query");
  const journal = createSemanticRecordJournal({ root, objectKind: JOURNAL_KIND });
  const recordsOf = category => journal.query({ category }).map(row => row.record);
  const existingObject = ni => {
    const matches = recordsOf(OBJECT_CATEGORY).filter(value => value.ni === ni);
    if (matches.length > 1) throw new TypeError("duplicate witness journal custody identity");
    return matches.length ? restoredObject(matches[0]) : null;
  };
  const record = (category, value) => journal.record({
    category, record: value, recordedAt: sourceTime(now), charge: HELD,
  });
  const custody = Object.freeze({
    async put({ ni, bytes, mediaType }) {
      required(ni, "object NI");
      required(mediaType, "object media type");
      const admitted = decodeObject(ni, bytes);
      const previous = existingObject(ni);
      if (previous) {
        if (previous.kind !== admitted.kind || previous.mediaType !== mediaType)
          throw new TypeError("witness journal custody address collision");
      } else {
        record(OBJECT_CATEGORY, { type: "WitnessJournalObject", version: 1, ni, kind: admitted.kind, mediaType, value: admitted.value });
      }
      return Object.freeze({ profile: PROFILE, ni, mediaType });
    },
    async get(reference) {
      const ni = required(typeof reference === "string" ? reference : reference?.ni, "object NI");
      const local = existingObject(ni);
      if (local) return Object.freeze({ ni, bytes: local.bytes, mediaType: local.mediaType });
      return legacy === undefined ? null : legacy.custody.get(reference);
    },
  });
  const categoryIndex = Object.freeze({
    async add({ predicate, category, ni }) {
      required(predicate, "predicate"); required(category, "category"); required(ni, "object NI");
      const matches = recordsOf(REFERENCE_CATEGORY).filter(value =>
        value.predicate === predicate && value.category === category && value.ni === ni);
      if (!matches.length)
        record(REFERENCE_CATEGORY, { type: "WitnessJournalCategoryReference", version: 1, predicate, category, ni });
      return Object.freeze({ profile: PROFILE, predicate, category, ni });
    },
    async query(category, { predicate = CATEGORY_PREDICATE, continuationToken } = {}) {
      required(category, "category"); required(predicate, "predicate");
      if (continuationToken !== undefined) throw new TypeError("witness journal category index does not paginate");
      const found = new Set(recordsOf(REFERENCE_CATEGORY)
        .filter(value => value.type === "WitnessJournalCategoryReference" && value.version === 1 &&
          value.predicate === predicate && value.category === category)
        .map(value => required(value.ni, "reference NI")));
      if (legacy !== undefined) {
        let token;
        const seen = new Set();
        for (let page = 0; page < 1000; page += 1) {
          const result = await legacy.categoryIndex.query(category,
            { predicate, ...(token === undefined ? {} : { continuationToken: token }) });
          if (!result || !Array.isArray(result.references)) throw new TypeError("invalid legacy category page");
          for (const reference of result.references) found.add(required(reference.ni, "legacy reference NI"));
          token = result.continuationToken;
          if (token === undefined) break;
          if (seen.has(token) || page === 999) throw new TypeError("legacy category continuation did not finish");
          seen.add(token);
        }
      }
      return Object.freeze({
        references: Object.freeze([...found].sort().map(ni => Object.freeze({ profile: PROFILE, predicate, category, ni }))),
        continuationToken: undefined,
      });
    },
  });
  return Object.freeze({ root: journal.root, custody, categoryIndex });
}
