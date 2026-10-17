import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  EMPTY_WITNESS_ROOT, identifyJsonSemanticContent,
} from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/semantic-content-identity";
import {
  recordWitnessJournalBatch, relationalWitnessJournalDocument,
  resolveWitnessJournalDocument, queryWitnessJournalDocumentsByCategory,
} from "@red-cup-engineering/witness-journal-document-service";
import { createSemanticRecordJournal } from "../src/index.mjs";
import { createJournalWitnessDocumentBinding } from "../src/witness-journal-binding.mjs";

const AT = "2026-10-17T17:00:00.000Z";
const clock = () => new Date(AT);
function scoped(fn) {
  const root = mkdtempSync(join(tmpdir(), "one-semantic-journal-"));
  return Promise.resolve().then(() => fn(root)).finally(() => rmSync(root, { force: true, recursive: true }));
}
function batch(value, category = "buyer") {
  const graph = "urn:561:market-order";
  return {
    graph, settlement: "pending-external-receipt", recordedAt: AT,
    document: relationalWitnessJournalDocument(value),
    assertions: [{ subject: graph, predicate: "urn:emsenn:witness-journal:category",
      object: { kind: "literal", value: category } }],
  };
}
const journal = root => createSemanticRecordJournal({ root, objectKind: "witness-journal" });

test("the original Data witness-document consumer survives a Systems journal restart", () => scoped(async root => {
  const one = createJournalWitnessDocumentBinding({ root, now: clock });
  const first = await recordWitnessJournalBatch({ ...one, batch: batch({ order: 7, buyer: "A" }) });
  assert.match(first.documentNi, /^ni:\/\/\/sha-256;/u);
  assert.equal(first.statementCount, 1);
  assert.equal(journal(root).query({ category: "custodiedObject" }).length, 2);
  assert.equal(journal(root).query({ category: "categoryReference" }).length, 1);
  const reopened = createJournalWitnessDocumentBinding({ root, now: clock });
  const found = await resolveWitnessJournalDocument(first.documentNi, reopened);
  assert.deepEqual(found.value, { order: 7, buyer: "A" });
  const listed = await queryWitnessJournalDocumentsByCategory("buyer", reopened);
  assert.deepEqual(listed.map(value => value.id), [first.documentNi]);
  await recordWitnessJournalBatch({ ...reopened, batch: batch({ order: 7, buyer: "A" }) });
  assert.equal(journal(root).query({ category: "custodiedObject" }).length, 2, "replay keeps originals once");
  assert.equal(journal(root).query({ category: "categoryReference" }).length, 1, "replay keeps category once");
  const second = await recordWitnessJournalBatch({ ...reopened, batch: batch({ order: 8, buyer: "B" }) });
  assert.notEqual(first.documentNi, second.documentNi);
  const both = await queryWitnessJournalDocumentsByCategory("buyer", reopened);
  assert.deepEqual(new Set(both.map(value => value.id)), new Set([first.documentNi, second.documentNi]));
}));

test("forged bytes, a different media type and a missing root refuse without replacing custody", () => scoped(async root => {
  assert.throws(() => createJournalWitnessDocumentBinding(), /root/);
  const binding = createJournalWitnessDocumentBinding({ root, now: clock });
  const value = { kind: "valid-record" };
  const identified = identifyJsonSemanticContent({
    objectKind: "witness-journal.document", value, witnessRoot: EMPTY_WITNESS_ROOT,
  });
  const changed = identifyJsonSemanticContent({
    objectKind: "witness-journal.document", value: { kind: "different" }, witnessRoot: EMPTY_WITNESS_ROOT,
  });
  await assert.rejects(binding.custody.put({
    ni: identified.token, bytes: changed.bytes, mediaType: "application/sen+cbor",
  }), /addressed document/);
  assert.equal(journal(root).query({ category: "custodiedObject" }).length, 0);
  await binding.custody.put({ ni: identified.token, bytes: identified.bytes, mediaType: "application/sen+cbor" });
  await assert.rejects(binding.custody.put({ ni: identified.token, bytes: identified.bytes, mediaType: "application/json" }), /collision/);
  const saved = await binding.custody.get(identified.token);
  assert.equal(Buffer.from(saved.bytes).equals(Buffer.from(identified.bytes)), true);
  assert.equal(journal(root).query({ category: "custodiedObject" }).length, 1);
}));

test("an invalid semantic relation refuses before anything can be appended", () => scoped(async root => {
  const source = journal(root);
  assert.throws(() => source.record({
    category: "orders", record: { order: 5 }, recordedAt: AT,
    charge: { support: true, refutation: false },
    relation: { subject: "present", predicate: "incomplete" },
  }), /relation requires subject, predicate, and object/);
  assert.equal(source.query({ category: "orders" }).length, 0);
  assert.deepEqual(source.claims(), []);
}));

test("legacy custody is consulted only for missing local objects; neither opening nor reading migrates it", () => scoped(async root => {
  const ni = identifyJsonSemanticContent({
    objectKind: "witness-journal.document", value: { retained: true }, witnessRoot: EMPTY_WITNESS_ROOT,
  });
  let reads = 0;
  const legacy = {
    custody: { async get() { reads += 1; return { ni: ni.token, bytes: ni.bytes, mediaType: "application/sen+cbor" }; } },
    categoryIndex: { async query() { return { references: [{ ni: ni.token }], continuationToken: undefined }; } },
  };
  const binding = createJournalWitnessDocumentBinding({ root, legacy, now: clock });
  assert.equal(journal(root).query({ category: "custodiedObject" }).length, 0);
  assert.equal((await binding.custody.get(ni.token)).ni, ni.token);
  assert.equal(reads, 1);
  assert.equal((await binding.categoryIndex.query("legacy")).references.length, 1);
  await binding.custody.put({ ni: ni.token, bytes: ni.bytes, mediaType: "application/sen+cbor" });
  assert.equal((await binding.custody.get(ni.token)).ni, ni.token);
  assert.equal(reads, 1, "once local, reads do not access legacy");
  assert.equal(journal(root).query({ category: "custodiedObject" }).length, 1);
}));
