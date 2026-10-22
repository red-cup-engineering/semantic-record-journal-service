# Semantic record journal — Systems

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

**Owner:** Computer Systems → Semiotic Computer Systems → Witness Journal → Semantic Record Journal.

**Purpose:** one durable EAVT journal for typed content-addressed witness
documents, time/custody claims, category references, messages, and settlement
receipts. This package owns the **filesystem effect**, not mathematical
identity, term evaluation, or commercial authority.

## Source-owned prerequisites

- **Computer Data**: SEN normal-form identity, canonical content bytes, NI
  tokens, JSON-to-SEN bridge, witness roots.
- **Computer Code**: SRN path derivation/admission and normalized-term identity.
- **WJ entry/log**: append-only generic EAVT and strict source SEAVT rows.
- **WJ document (Data)**: transport, batch/settlement records, HTTP
  interface, original filesystem custody inventory.
- **This package (Systems)**: compose that interface over the existing
  semantic record journal. No extra hashing law, sidecar database, or new
  transaction schema.
- **Upstream gateway/customer services**: authorization, x402 payment
  admission, actor/channel routing and actual economic settlement.
  A recorded payment assertion is not itself evidence of payment.

## Operator entrypoints

Install in the source-owning workspace; Node >=22 and linked upstream packages
are required.

    start-journal-witness-provider --root /var/lib/561/witness-journal --port 7331

This serves the existing document API and agent card **only on 127.0.0.1**;
a public gateway must independently authenticate and meter callers.

To carry an existing witness-document filesystem root into the journal:

    admit-witness-journal-files --from /original/witness-root --root /var/lib/561/witness-journal

Admission reads immutable objects and legacy carriers and preserves category
references and batch receipts. It reuses their canonical NI tokens, keeps
typed values rather than opaque bytes inside journal records, dates admission
from source file mtimes, and **never modifies the original root**.
It can be retried after interruption. A source-scoped marker marks receipt
of the observed root; do not keep routing live writes to the old provider
after cutover. Re-run at a controlled cutover, not with both writers active.

createJournalWitnessDocumentBinding({root, legacy}) can read the original
provider alongside the journal until that exact source root is admitted.
After its admission marker, the old root is not silently re-read. A different
legacy root remains a distinct source.

## Receiving

    npm run verify

Regression coverage calls the **original document consumer** against the
local and HTTP interfaces, including a process restart, idempotent repeat,
invalid-NI refusal, and read-only legacy admission. CI and deployment
qualification are separate requirements; committed source alone is not an
installed customer-facing service.

Keep historical RMN v2 coordinate commitments unchanged. The strict
witness-entry producer now uses source-owned SEN v3 identities; do not
reinterpret an RMN NI as a SEN NI or invent cross-format equivalence.
