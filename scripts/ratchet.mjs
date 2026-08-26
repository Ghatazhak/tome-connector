/**
 * The comparison behind both size ratchets.
 *
 * `verify-file-sizes.mjs` and `verify-function-sizes.mjs` differ only in what they measure - lines
 * in a file, lines in a function - and in whether being under the limit means "not tracked" or "not
 * reported at all". The rule they apply is the same one, so it lives here once and is tested
 * directly, rather than being proved by hand twice and then trusted.
 *
 * Pure: it takes two maps and returns a list of complaints. No filesystem, no eslint, no process.
 */

/**
 * @param {object} options
 * @param {Map<string, number>} options.sizes measured now
 * @param {Record<string, number>} options.baseline what was agreed
 * @param {number} options.limit the lint rule's threshold
 * @param {number} options.slack how far something may shrink before the baseline must be re-recorded
 * @param {string} options.noun what one entry is called, e.g. `'file'`
 * @param {string} options.updateCommand what to run to re-record
 * @param {boolean} [options.measuresOnlyOverLimit]
 *   True when the measurement itself only reports things over the limit, as eslint does - so an
 *   entry missing from `sizes` means it improved, not that it vanished. False when everything is
 *   measured and a missing entry means the file is gone.
 * @returns {string[]} failures, empty when everything holds
 */
export function compareToBaseline({
	sizes,
	baseline,
	limit,
	slack,
	noun,
	updateCommand,
	measuresOnlyOverLimit = false
}) {
	const failures = [];

	for (const [key, allowed] of Object.entries(baseline)) {
		const actual = sizes.get(key);

		if (actual === undefined) {
			failures.push(
				measuresOnlyOverLimit
					? `${key} is in the baseline but is no longer over ${limit} lines (or was renamed). ` +
						`Re-record with ${updateCommand} so the win is locked in.`
					: `${key} is in the baseline but no longer exists (renamed, or deleted). ` +
						`Re-record with ${updateCommand}.`
			);
			continue;
		}

		if (actual > allowed) {
			failures.push(
				`${key} grew to ${actual} lines; the baseline is ${allowed}. This ${noun} is already ` +
					`over the ${limit}-line limit - being on that list is not permission to keep growing.`
			);
			continue;
		}

		if (allowed - actual >= slack) {
			failures.push(
				`${key} is down to ${actual} lines from a baseline of ${allowed} - good, but record it: ` +
					`${updateCommand}. Until then the ratchet still permits ${allowed - actual} lines of regrowth.`
			);
		}
	}

	for (const [key, lines] of sizes) {
		if (lines > limit && !(key in baseline)) {
			failures.push(
				`${key} is ${lines} lines, over the ${limit}-line limit, and is not in the baseline. ` +
					`Nothing should join that list by accident: shorten it, or add it deliberately with ` +
					`${updateCommand}.`
			);
		}
	}

	return failures;
}

/** Everything over the limit, sorted, ready to be written as a baseline. */
export function recordBaseline(sizes, limit) {
	return Object.fromEntries(
		[...sizes].filter(([, lines]) => lines > limit).sort(([a], [b]) => a.localeCompare(b))
	);
}
