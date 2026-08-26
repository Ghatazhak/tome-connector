/**
 * A ratchet on the files that are already too long: they may shrink, and they may not grow.
 *
 * Ported from `tomevtt.client/scripts/verify-file-sizes.mjs`. This measures; the comparison lives
 * in `ratchet.mjs` and is shared with `verify-function-sizes.mjs`, which applies the same rule to
 * a different measurement. That split exists so the rule can be tested directly - it is the only
 * guardrail here enforcing a policy eslint cannot state, and it was proved by hand exactly once
 * before `tests/ratchet.test.ts` pinned it.
 *
 * The reasoning is that project's: `eslint.config.mts` caps files at 700 lines, and a file-level
 * `eslint-disable max-lines` is unbounded, so once a file has one it can grow forever without
 * anything saying a word. The disable records *why* a file is exempt; this baseline records *how
 * big it was when we agreed to that*. A comment cannot fail a build, and a number cannot explain
 * itself.
 *
 * The connector starts with an empty baseline - nothing is over the limit today. That is the good
 * time to add this, because the ratchet then only ever has to hold a line rather than claw one back.
 *
 * Usage:
 *   node scripts/verify-file-sizes.mjs            # check (what `npm run lint` runs)
 *   node scripts/verify-file-sizes.mjs --update   # record the current sizes
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { compareToBaseline, recordBaseline } from './ratchet.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'scripts', 'file-size-baseline.json');

/** Matches `max-lines` in eslint.config.mts, and must keep matching it. */
const LIMIT = 700;

/**
 * How far a file may shrink before the baseline has to be refreshed, so a real reduction is locked
 * in rather than left as headroom to spend again.
 */
const SLACK = 25;

/** Every line counts, including comments - matching `skipComments: false` on the eslint rule. */
const countLines = (path) => readFileSync(path, 'utf8').split('\n').length;

/**
 * `src` only. Tests live in `tests/` here rather than beside the source, and are exempt for the
 * reason the client exempts its specs: a `describe` is itself a function and a thorough suite is
 * legitimately long.
 */
function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sourceFiles(full, found);
      continue;
    }
    if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

const sizes = new Map(
  sourceFiles(join(root, 'src')).map((path) => [
    relative(root, path).split(sep).join('/'),
    countLines(path)
  ])
);

if (process.argv.includes('--update')) {
  const recorded = recordBaseline(sizes, LIMIT);
  writeFileSync(baselinePath, `${JSON.stringify(recorded, null, 2)}\n`, 'utf8');
  const names = Object.keys(recorded);
  console.log(`Recorded ${names.length} file${names.length === 1 ? '' : 's'} over ${LIMIT} lines:`);
  for (const name of names) {
    console.log(`  ${String(recorded[name]).padStart(5)}  ${name}`);
  }
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch {
  console.error(
    'File size baseline not found or unreadable at scripts/file-size-baseline.json.\n' +
      '  Run: node scripts/verify-file-sizes.mjs --update\n'
  );
  process.exit(1);
}

const failures = compareToBaseline({
  sizes,
  baseline,
  limit: LIMIT,
  slack: SLACK,
  noun: 'file',
  updateCommand: 'node scripts/verify-file-sizes.mjs --update'
});

if (failures.length) {
  console.error('File size verification failed:\n');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error(
    '\n  An eslint-disable records why a file is exempt; this baseline records how big it was\n' +
      '  when that was agreed. Without the second one, the first is unbounded.\n'
  );
  process.exit(1);
}

const tracked = Object.keys(baseline).length;
console.log(
  `File sizes OK - ${tracked} file${tracked === 1 ? '' : 's'} over ${LIMIT} lines, none grown.`
);
