import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  EMPTY_WITNESS_ROOT, identifyJsonSemanticContent,
} from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/semantic-content-identity";
import {
  recordWitnessJournalBatch, relationalWitnessJournalDocument,
  resolveWitnessJournalDocument, queryWitnessJournalDocumentsByCategory,
} from "@red-cup-engineering/witness-journal-document-service";
import { createFilesystemWitnessJournalBinding, readFilesystemWitnessJournal } from "@red-cup-engineering/witness-journal-document-service/filesystem-provider";
import { createSemanticRecordJournal } from "../src/index.mjs";
import { appendEntries, logPathFor } from "@red-cup-engineering/witness-journal-log-service";
import { entry } from "@red-cup-engineering/witness-journal-entry-service";
import { admitWitnessJournalFiles, createJournalWitnessDocumentBinding, startJournalWitnessDocumentProviderProcess } from "../src/witness-journal-binding.mjs";

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

test("refused claim writes do not publish content, and a retry genuinely receives both feeds", () => scoped(root => {
  const source = journal(root);
  const sample = { category: "proof-test", record: { observation: 47 }, recordedAt: AT,
    charge: { support: true, refutation: false } };
  // Make the original strict-claim directory a regular file. The genuine
  // supplier read/append must refuse; a content-first implementation instead
  // leaks a query-visible, unconfirmed record.
  const claimFolder = dirname(logPathFor(root, "semantic-record-seavt-claims", AT));
  mkdirSync(dirname(claimFolder), { recursive: true });
  writeFileSync(claimFolder, "deny claims", { flag: "wx" });
  assert.throws(() => source.record(sample));
  rmSync(claimFolder);
  assert.equal(source.query({ category: sample.category }).length, 0,
    "claim refusal is not silently accepted as a content witness");

  // Conversely a failed content append may leave valid orphan claims, but
  // without a content record it cannot be received or counted.
  const contentFolder = dirname(logPathFor(root, "semantic-record-content", AT));
  mkdirSync(dirname(contentFolder), { recursive: true });
  writeFileSync(contentFolder, "deny content", { flag: "wx" });
  assert.throws(() => source.record(sample));
  rmSync(contentFolder);
  assert.equal(source.query({ category: sample.category }).length, 0);
  assert.ok(source.claims().length >= 2, "the first claims append was durable");

  const accepted = source.record(sample);
  assert.equal(source.query({ category: sample.category }).length, 1);
  assert.equal(source.query({ category: sample.category })[0].id, accepted.id);
  source.record(sample);
  assert.equal(source.query({ category: sample.category }).length, 1,
    "idempotent retry cannot count one observation twice");
}));

test("a pre-existing content-only witness refuses rather than silently becoming accepted evidence", () => scoped(root => {
  const source = journal(root);
  const category = "orphan-proof-test", value = { observation: "incomplete" };
  const identified = identifyJsonSemanticContent({
    objectKind: "witness-journal", value, witnessRoot: EMPTY_WITNESS_ROOT,
  });
  appendEntries(root, "semantic-record-content",
    [entry(identified.id, category, value, AT)], AT);
  assert.throws(() => source.query({ category }), /lacks admitted category\/content claims/);
  // Repair through the original source-owned producer; no alternative log or
  // fabricated acceptance marker is introduced.
  const committed = source.record({
    category, record: value, recordedAt: AT, charge: { support: true, refutation: false },
  });
  assert.equal(committed.id, identified.id);
  assert.equal(source.query({ category }).length, 1);
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

test("the original HTTP client reads the same addressed ledger after server restart", () => scoped(async root => {
  const first = await startJournalWitnessDocumentProviderProcess({ root, now: clock });
  assert.equal(new URL(first.baseUrl).hostname, "127.0.0.1", "unpriced provider never directly binds a public interface");
  let accepted;
  try {
    accepted = await recordWitnessJournalBatch({ agentUrl: first.baseUrl, batch: batch({ order: 24 }, "paid-work") });
  } finally { await first.close(); }
  const second = await startJournalWitnessDocumentProviderProcess({ root, now: clock });
  try {
    const document = await resolveWitnessJournalDocument(accepted.documentNi, { agentUrl: second.baseUrl });
    assert.deepEqual(document.value, { order: 24 });
    const result = await queryWitnessJournalDocumentsByCategory("paid-work", { agentUrl: second.baseUrl });
    assert.deepEqual(result.map(value => value.id), [accepted.documentNi]);
  } finally { await second.close(); }
}));

test("offline admission preserves the source filesystem, carries receipts and links, and retires only that legacy root", () => scoped(async root => {
  const files = mkdtempSync(join(tmpdir(), "legacy-witness-documents-"));
  try {
    const previous = await createFilesystemWitnessJournalBinding(files);
    const old = await recordWitnessJournalBatch({ ...previous, batch: batch({ order: "old" }, "cash") });
    const inventory = await readFilesystemWitnessJournal(files);
    assert.equal(inventory.objects.length, 2);
    assert.equal(inventory.references.length, 1);
    const originals = inventory.objects.concat(inventory.references).map(value =>
      [value.path, readFileSync(value.path).toString("base64")]);
    const hybrid = createJournalWitnessDocumentBinding({ root, legacy: previous, now: clock });
    assert.deepEqual((await queryWitnessJournalDocumentsByCategory("cash", hybrid)).map(value => value.id), [old.documentNi]);
    assert.deepEqual(await admitWitnessJournalFiles({ from: files, root }), { done: true, objects: 2, references: 1 });
    assert.deepEqual(await admitWitnessJournalFiles({ from: files, root }), { done: true, objects: 0, references: 0 });
    for (const [path, data] of originals) assert.equal(readFileSync(path).toString("base64"), data, "admission never rewrites source");
    const reopened = createJournalWitnessDocumentBinding({ root, now: clock });
    assert.deepEqual((await queryWitnessJournalDocumentsByCategory("cash", reopened)).map(value => value.id), [old.documentNi]);
    assert.ok(await reopened.custody.get(old.digest), "batch receipt was admitted, not only document");
    await recordWitnessJournalBatch({ ...previous, batch: batch({ order: "newer" }, "cash") });
    assert.deepEqual((await queryWitnessJournalDocumentsByCategory("cash", hybrid)).map(value => value.id), [old.documentNi],
      "once admitted the original source no longer leaks into the cut");
    const different = mkdtempSync(join(tmpdir(), "other-legacy-witness-"));
    try {
      await assert.rejects(admitWitnessJournalFiles({ from: different, root }), /another source/);
    } finally { rmSync(different, { recursive: true, force: true }); }
  } finally { rmSync(files, { recursive: true, force: true }); }
}));
