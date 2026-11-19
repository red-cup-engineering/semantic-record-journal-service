# Semantic record journal — Systems

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

**Owner:** Computer Systems → Semiotic Computer Systems.

The semantic record journal stores addressed content alongside strict SEAVT
claims using the SEAVT engine's SRN row and log interfaces.

    start-seavt-document-provider --root /var/lib/561/witness-journal --port 7331

An installed MetroPlat host selects the service-only application:

```json
{
  "module": "@red-cup-engineering/semantic-record-journal-service/application",
  "export": "semanticRecordDocumentApplication",
  "configuration": {"root": "/var/lib/561/witness-journal", "port": 19764}
}
```

FeltOS 0.22.11 or later owns this application's service lifetime. It returns no
public entrance, opens only the original loopback listener, and reuses that
listener when the entrance is rebuilt. Shutdown closes it. The CLI delegates
to the same provider for command-line consumers; a native host needs no
independent user service.

The provider listens on loopback. New document writes use the SEAVT store.
Existing semantic-record documents remain readable through their original
claims and category records. Use the engine's `admit-seavt-documents` command
to admit documents held at a separate offline filesystem root.

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
