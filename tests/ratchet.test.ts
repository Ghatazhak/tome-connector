import { describe, expect, it } from 'vitest';

// Plain ESM with a hand-written `.d.ts` beside it: the scripts run under bare
// node from an npm script, and the module must not live in `src`, which esbuild
// bundles into the shipped `main.js`.
import { compareToBaseline, recordBaseline } from '../scripts/ratchet.mjs';

/**
 * The size ratchets are the only guardrails in this repo that enforce a policy
 * nothing else states — eslint cannot compare against a checked-in baseline. They
 * were proved by hand once, which does not survive the next person changing them,
 * so the comparison lives in its own module and is pinned here.
 *
 * Both directions matter. Blocking growth is the obvious half; refusing to let a
 * real reduction go unrecorded is the half that stops the ratchet quietly turning
 * into permission to regrow.
 */

const options = {
	limit: 50,
	slack: 10,
	noun: 'function',
	updateCommand: 'npm run ratchet'
};

const check = (sizes: [string, number][], baseline: Record<string, number>, extra = {}) =>
	compareToBaseline({ sizes: new Map(sizes), baseline, ...options, ...extra });

describe('compareToBaseline', () => {
	it('passes when everything is exactly at its baseline', () => {
		expect(check([['a.ts::f', 61]], { 'a.ts::f': 61 })).toEqual([]);
	});

	it('passes when nothing is over the limit and the baseline is empty', () => {
		expect(check([['a.ts::f', 12]], {})).toEqual([]);
	});

	it('fails when a tracked entry grows by even one line', () => {
		const failures = check([['a.ts::f', 62]], { 'a.ts::f': 61 });

		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('grew to 62');
		expect(failures[0]).toContain('not permission to keep growing');
	});

	it('tolerates a reduction smaller than the slack', () => {
		expect(check([['a.ts::f', 55]], { 'a.ts::f': 61 })).toEqual([]);
	});

	/** Otherwise the ratchet only ever stops things getting worse. */
	it('fails when a reduction reaches the slack, so the win gets recorded', () => {
		const failures = check([['a.ts::f', 51]], { 'a.ts::f': 61 });

		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('down to 51');
		expect(failures[0]).toContain('npm run ratchet');
	});

	it('fails when something new goes over the limit', () => {
		const failures = check([['b.ts::g', 80]], {});

		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('is not in the baseline');
	});

	it('says nothing about something new that is under the limit', () => {
		expect(check([['b.ts::g', 49]], {})).toEqual([]);
	});

	it('reports every problem at once rather than stopping at the first', () => {
		const failures = check(
			[
				['a.ts::f', 62],
				['b.ts::g', 80]
			],
			{ 'a.ts::f': 61 }
		);

		expect(failures).toHaveLength(2);
	});

	describe('when a baseline entry is no longer measured', () => {
		/**
		 * The two callers mean different things by absence. The file script measures
		 * everything, so a missing entry is a deleted file. The function script only
		 * ever hears about things over the limit, so a missing entry is a success.
		 */
		it('reads it as deleted when everything is measured', () => {
			const failures = check([], { 'gone.ts': 900 });

			expect(failures[0]).toContain('no longer exists');
		});

		it('reads it as improved when only over-limit entries are measured', () => {
			const failures = check([], { 'a.ts::f': 61 }, { measuresOnlyOverLimit: true });

			expect(failures[0]).toContain('no longer over 50 lines');
			expect(failures[0]).toContain('locked in');
		});
	});
});

describe('recordBaseline', () => {
	it('records only what is over the limit', () => {
		const recorded = recordBaseline(
			new Map([
				['b.ts', 80],
				['a.ts', 10]
			]),
			50
		);

		expect(recorded).toEqual({ 'b.ts': 80 });
	});

	/** Sorted so re-recording produces a reviewable diff rather than a reshuffle. */
	it('sorts by key', () => {
		const recorded = recordBaseline(
			new Map([
				['z.ts', 80],
				['a.ts', 90]
			]),
			50
		);

		expect(Object.keys(recorded)).toEqual(['a.ts', 'z.ts']);
	});
});
