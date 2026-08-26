import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
	DIAGNOSTIC_SCRIPT,
	GUEST_SETTLE_SCRIPT,
	NEUTRALIZE_PRINT_MEDIA_SCRIPT,
	buildInjectionScript,
	printBodyClass,
} from '../src/tomePdfPrinter';
import { TOME_PRINT_CSS } from '../src/tomePrintStyles';

/**
 * Every one of these scripts is written as a template literal and then handed
 * to the guest to be re-parsed as JavaScript, so a quoting or escaping mistake
 * survives the build and only fails at print time - where the symptom is a
 * silently blank PDF. Parsing them here is the cheap way to catch that.
 */
const SCRIPTS = {
	NEUTRALIZE_PRINT_MEDIA_SCRIPT,
	DIAGNOSTIC_SCRIPT,
	GUEST_SETTLE_SCRIPT,
};

describe('guest scripts', () => {
	it.each(Object.entries(SCRIPTS))('%s parses as JavaScript', (_name, script) => {
		expect(() => new vm.Script(script)).not.toThrow();
	});

	it.each(Object.entries(SCRIPTS))(
		'%s is a self-contained expression',
		(_name, script) => {
			expect(script.trimStart().startsWith('(function ()')).toBe(true);
		},
	);
});

/** Stands in for the guest document so the injection can actually be run. */
function runInjection(request: {
	bodyHtml: string;
	bodyClass: string;
	headHtml: string;
}) {
	const appended: { textContent: string }[] = [];
	const doc = {
		head: {
			innerHTML: '',
			appendChild: (el: { textContent: string }) => appended.push(el),
		},
		body: { innerHTML: '', className: '' },
		createElement: () => ({ textContent: '' }),
	};

	// The script is an IIFE expression, so the sandbox evaluates it and the
	// stub document records exactly what the guest would have been given.
	vm.runInNewContext(buildInjectionScript(request), { document: doc });

	return { doc, appended };
}

describe('buildInjectionScript', () => {
	it('transfers the body, class and head verbatim', () => {
		const request = {
			bodyHtml: '<div class="tome-export-root"><p>Hello</p></div>',
			bodyClass: 'theme-light obsidian-app',
			headHtml: '<style>p{color:red}</style>',
		};

		const { doc, appended } = runInjection(request);

		expect(doc.body.innerHTML).toBe(request.bodyHtml);
		expect(doc.body.className).toBe(request.bodyClass);
		expect(doc.head.innerHTML).toBe(request.headHtml);
		expect(appended).toHaveLength(1);
		expect(appended[0]?.textContent).toBe(TOME_PRINT_CSS);
	});

	it('survives markup that would break naive string interpolation', () => {
		// Backticks and ${} would end the template literal; backslashes and
		// quotes would break the string literal; a line separator is invalid
		// raw inside a JavaScript string.
		const bodyHtml = [
			'<p>back`tick and ${interpolation}</p>',
			'<p>quote " and \' and backslash \\ </p>',
			'<p>newline\nand tab\t</p>',
			'<p>unicode     line separators</p>',
			'<p>emoji 🎲 and accents Ördögök</p>',
		].join('');

		const { doc } = runInjection({
			bodyHtml,
			bodyClass: 'theme-light',
			headHtml: '<style>a{content:"`"}</style>',
		});

		expect(doc.body.innerHTML).toBe(bodyHtml);
	});

	it('escapes a closing script tag in the markup', () => {
		const bodyHtml = '<p>literally </script> in the text</p>';

		const { doc } = runInjection({
			bodyHtml,
			bodyClass: '',
			headHtml: '',
		});

		expect(doc.body.innerHTML).toBe(bodyHtml);
	});
});

describe('printBodyClass', () => {
	it('swaps the dark theme for the light one', () => {
		expect(printBodyClass('obsidian-app theme-dark is-focused')).toBe(
			'obsidian-app is-focused theme-light',
		);
	});

	it('leaves an already-light body alone', () => {
		expect(printBodyClass('obsidian-app theme-light')).toBe(
			'obsidian-app theme-light',
		);
	});

	it('adds the light theme when neither is present', () => {
		expect(printBodyClass('obsidian-app')).toBe('obsidian-app theme-light');
	});

	it('collapses stray whitespace', () => {
		expect(printBodyClass('  a   theme-dark  b  ')).toBe('a b theme-light');
	});

	it('handles an empty class list', () => {
		expect(printBodyClass('')).toBe('theme-light');
	});
});
