import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/computer-content-address-engineering-services-section/semantic-content-identity";
import { entry, seavt } from "@red-cup-engineering/witness-journal-entry-service";
import { appendEntries, appendSeavt, readEntriesAtPath, readSeavtAtPath } from "@red-cup-engineering/witness-journal-log-service";

const TOKEN = /^ni:\/\/\/sha-256;([A-Za-z0-9_-]{43})$/u;
const CONTENT_FEED = "semantic-record-content";
const CLAIM_FEED = "semantic-record-seavt-claims";

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
  return `category:${createHash("sha256").update(requiredText(category, "category")).digest("hex")}`;
}
function relationCoordinate(role, value) {
  return `${role}.${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
function filesBelow(directory, suffix) {
  const found = [];
  try {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) found.push(...filesBelow(path, suffix));
      else if (item.isFile() && item.name === suffix) found.push(path);
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return found.sort();
}
function axes(charge) {
  if (!charge || Object.getPrototypeOf(charge) !== Object.prototype || typeof charge.support !== "boolean" || typeof charge.refutation !== "boolean") {
    throw new TypeError("Semantic record journal charge requires independent support and refutation booleans");
  }
  return charge;
}

export function createSemanticRecordJournal({ root, objectKind: defaultObjectKind }) {
  const custodyRoot = resolve(root);
  function record({ objectKind, category, record: value, recordedAt, charge, relation }) {
    const kind = requiredText(objectKind ?? defaultObjectKind, "objectKind"), observed = axes(charge);
    const identity = identifyJsonSemanticContent({ objectKind: kind, value, witnessRoot: EMPTY_WITNESS_ROOT });
    const hex = tokenHex(identity.id), entity = `record.${hex}`, content = `content.${hex}`, categoryClaim = categoryCoordinate(category);
    const contentResult = appendEntries(custodyRoot, CONTENT_FEED, [entry(identity.id, category, value, recordedAt)], recordedAt);
    const claims = [seavt(entity, "journal:category", categoryClaim, recordedAt), seavt(entity, "journal:content", content, recordedAt)];
    if (relation !== undefined) {
      if (!relation || Object.getPrototypeOf(relation) !== Object.prototype || !Object.hasOwn(relation, "subject") || !Object.hasOwn(relation, "predicate") || !Object.hasOwn(relation, "object")) throw new TypeError("Semantic record journal relation requires subject, predicate, and object");
      claims.push(seavt(relationCoordinate("subject", relation.subject), relationCoordinate("predicate", relation.predicate), relationCoordinate("object", relation.object), recordedAt));
    }
    if (observed.support) claims.push(seavt(entity, "charge:support", "evidence.present", recordedAt));
    if (observed.refutation) claims.push(seavt(entity, "charge:refutation", "evidence.present", recordedAt));
    const claimResult = appendSeavt(custodyRoot, CLAIM_FEED, claims, recordedAt);
    return Object.freeze({ id: identity.id, objectKind: kind, contentAppended: contentResult.appended, claimsAppended: claimResult.appended, charge: Object.freeze({ ...observed }) });
  }
  function query({ objectKind, category }) {
    const kind = requiredText(objectKind ?? defaultObjectKind, "objectKind");
    const paths = filesBelow(join(custodyRoot, "data", "logs"), `${CONTENT_FEED}.jsonl`);
    const records = [];
    for (const path of paths) for (const row of readEntriesAtPath(path)) {
      if (row.a !== category) continue;
      const identity = identifyJsonSemanticContent({ objectKind: kind, value: row.v, witnessRoot: EMPTY_WITNESS_ROOT });
      if (identity.id !== row.e) throw new Error(`Semantic record journal content identity drift at ${path}`);
      records.push(Object.freeze({ id: row.e, objectKind: kind, category, recordedAt: row.t, record: row.v }));
    }
    return Object.freeze(records);
  }
  function claims() {
    const paths = filesBelow(join(custodyRoot, "data", "logs"), `${CLAIM_FEED}.jsonl`);
    return Object.freeze(paths.flatMap((path) => readSeavtAtPath(path)));
  }
  return Object.freeze({ root: custodyRoot, record, query, claims });
}
