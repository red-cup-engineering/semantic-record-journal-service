import { sha256Hex } from "@red-cup-engineering/semiotic-content-address-system";
import { resolve } from "node:path";
import { dataArtifactFiles } from "@red-cup-engineering/eavt-engineering-services-section/data-artifact-listing";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/computer-code-engine/semiotic-expression-notation/semantic-content-identity";
import { entry, seavt } from "@red-cup-engineering/semiotic-eavt-engineering-services-section/srn-row";
import { appendEntries, appendSeavt, readEntriesAtPath, readSeavtAtPath } from "@red-cup-engineering/semiotic-eavt-engineering-services-section/srn-log";

const TOKEN = /^ni:\/\/\/sha-256;([A-Za-z0-9_-]{43})$/u;
const CONTENT_FEED = "semantic-record-content";
const CLAIM_FEED = "semantic-record-seavt-claims";
const ATTRIBUTION_FEED = "semantic-record-attribution";
const observationKey = (entity, at) => JSON.stringify([entity, at]);

function tokenHex(token) {
  const match = TOKEN.exec(token);
  if (!match) throw new TypeError("Semantic record journal requires one SHA-256 NI token");
  return Buffer.from(match[1], "base64url").toString("hex");
}
function requiredText(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`Semantic record journal ${label} is required`);
  return value;
}
function categoryCoordinate(category) {
  return `category:${sha256Hex(requiredText(category, "category"))}`;
}
function relationCoordinate(role, value) {
  return `${role}.${sha256Hex(JSON.stringify(value))}`;
}
function feedFiles(root, feed) {
  return dataArtifactFiles(root, "log", { subject: feed, match: (filename) => filename.endsWith(".jsonl") }).map((file) => file.path);
}
function axes(charge) {
  if (!charge || Object.getPrototypeOf(charge) !== Object.prototype || typeof charge.support !== "boolean" || typeof charge.refutation !== "boolean") {
    throw new TypeError("Semantic record journal charge requires independent support and refutation booleans");
  }
  return charge;
}

function evidenceAxes(told) {
  const present = value => Array.isArray(value) ? value.length > 0 : value;
  return axes({ support: present(told?.for), refutation: present(told?.against) });
}

export function chargeOfTold(told) {
  const { support, refutation } = evidenceAxes(told);
  if (support) return refutation ? "contested" : "held";
  return refutation ? "denied" : "unknown";
}

/** Expose independent evidence axes beside the underlying SEAVT records. */
export function createEvidenceJournal(options) {
  const journal = createSemanticRecordJournal(options);
  return Object.freeze({
    ...journal,
    record({ told, charge = evidenceAxes(told), ...input }) {
      const result = journal.record({ ...input, charge });
      return Object.freeze({ ...result, events: Object.freeze([result.id]) });
    },
    query(input) {
      return journal.query({ ...input, includeEvidence: true });
    },
  });
}

export function createSemanticRecordJournal({ root, objectKind: defaultObjectKind }) {
  const custodyRoot = resolve(root);
  function record({ objectKind, category, record: value, recordedAt, charge, relation, origin, causes }) {
    const kind = requiredText(objectKind ?? defaultObjectKind, "objectKind"), observed = axes(charge);
    const identity = identifyJsonSemanticContent({ objectKind: kind, value, witnessRoot: EMPTY_WITNESS_ROOT });
    const hex = tokenHex(identity.id), entity = `record.${hex}`, content = `content.${hex}`, categoryClaim = categoryCoordinate(category);
    const claims = [seavt(entity, "journal:category", categoryClaim, recordedAt), seavt(entity, "journal:content", content, recordedAt)];
    if (relation !== undefined) {
      if (!relation || Object.getPrototypeOf(relation) !== Object.prototype || !Object.hasOwn(relation, "subject") || !Object.hasOwn(relation, "predicate") || !Object.hasOwn(relation, "object")) throw new TypeError("Semantic record journal relation requires subject, predicate, and object");
      claims.push(seavt(relationCoordinate("subject", relation.subject), relationCoordinate("predicate", relation.predicate), relationCoordinate("object", relation.object), recordedAt));
    }
    if (observed.support) claims.push(seavt(entity, "charge:support", "evidence.present", recordedAt));
    if (observed.refutation) claims.push(seavt(entity, "charge:refutation", "evidence.present", recordedAt));
    // Publish supporting claims and attribution before the record becomes queryable.
    const contentRow = entry(identity.id, category, value, recordedAt);
    const attribution = {
      ...(origin === undefined ? {} : { origin }),
      ...(causes === undefined ? {} : { causes }),
    };
    const attributionRow = Object.keys(attribution).length
      ? entry(identity.id, category, attribution, recordedAt)
      : undefined;
    const claimResult = appendSeavt(custodyRoot, CLAIM_FEED, claims, recordedAt);
    if (attributionRow) appendEntries(custodyRoot, ATTRIBUTION_FEED, [attributionRow], recordedAt);
    const contentResult = appendEntries(custodyRoot, CONTENT_FEED, [contentRow], recordedAt);
    return Object.freeze({ id: identity.id, objectKind: kind, contentAppended: contentResult.appended, claimsAppended: claimResult.appended, charge: Object.freeze({ ...observed }) });
  }
  function query({ objectKind, category, includeEvidence = false }) {
    const kind = requiredText(objectKind ?? defaultObjectKind, "objectKind");
    const paths = feedFiles(custodyRoot, CONTENT_FEED);
    // A content line is not a committed record unless both independently
    // written strict claims carry the same content identity, category and time.
    // Build one index per read, not one full claims scan per content row.
    const categoryClaim = categoryCoordinate(category);
    const categories = new Set(), contents = new Set();
    const supportive = new Set(), refuting = new Set(), attribution = new Map();
    for (const path of feedFiles(custodyRoot, CLAIM_FEED)) {
      for (const claim of readSeavtAtPath(path)) {
        if (claim.a === "journal:category" && claim.v === categoryClaim)
          categories.add(observationKey(claim.e, claim.t));
        if (claim.a === "journal:content")
          contents.add(JSON.stringify([claim.e, claim.t, claim.v]));
        if (includeEvidence && claim.v === "evidence.present") {
          if (claim.a === "charge:support") supportive.add(observationKey(claim.e, claim.t));
          if (claim.a === "charge:refutation") refuting.add(observationKey(claim.e, claim.t));
        }
      }
    }
    if (includeEvidence) {
      for (const path of feedFiles(custodyRoot, ATTRIBUTION_FEED)) for (const row of readEntriesAtPath(path)) {
        if (row.a !== category) continue;
        const key = observationKey(row.e, row.t);
        if (attribution.has(key) && JSON.stringify(attribution.get(key)) !== JSON.stringify(row.v)) {
          throw new TypeError("Semantic record journal has inconsistent attribution for one observation");
        }
        attribution.set(key, row.v);
      }
    }
    const records = [];
    for (const path of paths) for (const row of readEntriesAtPath(path)) {
      if (row.a !== category) continue;
      const identity = identifyJsonSemanticContent({ objectKind: kind, value: row.v, witnessRoot: EMPTY_WITNESS_ROOT });
      if (identity.id !== row.e) throw new Error(`Semantic record journal content identity drift at ${path}`);
      const hex = tokenHex(row.e), entity = `record.${hex}`;
      const key = observationKey(entity, row.t);
      if (!categories.has(key) ||
          !contents.has(JSON.stringify([entity, row.t, `content.${hex}`])))
        throw new TypeError("Semantic record journal content lacks admitted category/content claims");
      const evidence = includeEvidence ? {
        ...attribution.get(observationKey(row.e, row.t)),
        told: Object.freeze({ for: supportive.has(key), against: refuting.has(key) }),
      } : {};
      records.push(Object.freeze({ id: row.e, objectKind: kind, category, recordedAt: row.t, record: row.v, ...evidence }));
    }
    return Object.freeze(records);
  }
  function claims() {
    const paths = feedFiles(custodyRoot, CLAIM_FEED);
    return Object.freeze(paths.flatMap((path) => readSeavtAtPath(path)));
  }
  return Object.freeze({ root: custodyRoot, record, query, claims });
}
