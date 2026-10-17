#!/usr/bin/env node
/** Offline admission; source files are never modified or removed. */
import { parseArgs } from "node:util";
import { admitWitnessJournalFiles } from "../src/witness-journal-binding.mjs";

const { values } = parseArgs({
  options: { from: { type: "string" }, root: { type: "string" } },
});
if (!values.from || !values.root) {
  process.stderr.write("usage: admit-witness-journal-files --from <original-filesystem-root> --root <systems-journal-root>\n");
  process.exitCode = 2;
} else {
  process.stdout.write(JSON.stringify(await admitWitnessJournalFiles({ from: values.from, root: values.root })) + "\n");
}
