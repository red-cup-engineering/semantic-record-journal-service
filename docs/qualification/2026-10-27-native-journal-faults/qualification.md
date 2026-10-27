# Correct the native fault injection; retain draft qualification boundary

The two feed-failure tests must obstruct the exact file returned by `logPathFor`, not its parent directory. Issued `witness-journal-log-service@0.1.4` places both feed files in one date directory. Blocking that shared parent also blocks the supposedly writable feed, so the previous fault injection did not discriminate content-first publication from claims-first publication.

The test correction creates a directory at the exact claim file or exact content file, asserts that those paths differ, and removes that obstruction before readback. The source implementation and package manifest remain unchanged from draft PR1 head `7f538d783d145c7e3353afbd0f5dc030df9200f6`.

## Authentic negative control

The corrected two cases were executed against issued `semantic-record-journal-service@0.1.2` with its actual exact declared native suppliers. Both fail for the intended semantic reasons:

1. A failed claim append leaves one query-visible content record, where zero is required.
2. A pre-existing content-only record is returned instead of refusing for missing category/content claims.

Result: **0 pass, 2 fail**, with no provider mock, copied implementation or substituted identity operation. This proves the issued-provider defect; it does not qualify the draft source as repaired.

## Remaining original-owner dependency gap

The draft source reads the canonical EAVT journal layout. Issued log versions `0.1.4`, `0.1.12` and `0.3.0` use the older date-directory layout. A native smoke against the draft with issued log `0.1.4` successfully appends content and claims but reads back an empty result because the layouts disagree.

Original `witness-journal-log-service` main `b718f1d45225cb5a9ee8eedc355cfa038c3c4cd8` uses the matching canonical layout and refuses non-ENOENT read failures. That source package is private and requires `json-file-codec-service@0.1.3`, whose exact registry metadata returns 404. No exact payload for that supplier is present in the inspected native dependency sets. The draft's witness-document binding also lacks a received complete local closure.

Keep PR1 in draft until the original owners supply and qualify that coherent dependency set. Do not alias the older codec under the missing package name, downshift the layout, or take the breaking `0.3.0` entry contract merely to make tests execute. This test fix makes the missing qualification concrete; it does not claim journal atomicity or production readiness.
