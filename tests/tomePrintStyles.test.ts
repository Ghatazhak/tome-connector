import { describe, expect, it } from 'vitest';
import { TOME_PRINT_CSS } from '../src/tomePrintStyles';

/**
 * The stylesheet is a template literal, so a stray backtick in one of its
 * comments silently truncates it (or fails the build in a way that points at
 * the wrong line). It is also injected into the print guest as a JavaScript
 * string, so an unescaped sequence there would break the injection at runtime
 * rather than at build time.
 */
describe('TOME_PRINT_CSS', () => {
	it('contains no characters that would break the template literal', () => {
		expect(TOME_PRINT_CSS).not.toContain('`');
		expect(TOME_PRINT_CSS).not.toContain('${');
	});

	it('survives a round trip through JSON, as the injector does', () => {
		expect(JSON.parse(JSON.stringify(TOME_PRINT_CSS))).toBe(TOME_PRINT_CSS);
	});

	it('has balanced braces', () => {
		const open = (TOME_PRINT_CSS.match(/\{/g) ?? []).length;
		const close = (TOME_PRINT_CSS.match(/\}/g) ?? []).length;
		expect(open).toBe(close);
	});

	it('undoes the app-shell rules that collapse the printed document', () => {
		// These are the declarations that make the export paginate at all; see
		// the comments in tomePrintStyles.ts. A regression here prints a
		// correctly paginated PDF with nothing on the pages.
		for (const declaration of [
			'contain: none !important',
			'content-visibility: visible !important',
			'position: static !important',
			'overflow: visible !important',
			'height: auto !important',
		]) {
			expect(TOME_PRINT_CSS).toContain(declaration);
		}
	});

	it('starts each note and subfolder on a new page', () => {
		expect(TOME_PRINT_CSS).toContain('break-before: page');
	});

	it('neutralizes the effects that force Chromium to rasterize', () => {
		// Each of these makes a region impossible to draw as vector, so the
		// printer flattens it to a page-sized lossless bitmap - measured at
		// ~1.5 MB per page region on a themed book, and entirely outside the
		// image optimizer. They are here for file size, not for looks.
		for (const property of [
			'filter: none !important',
			'backdrop-filter: none !important',
			'mix-blend-mode: normal !important',
			'box-shadow: none !important',
			'text-shadow: none !important',
			'mask: none !important',
			'clip-path: none !important',
			'will-change: auto !important',
		]) {
			expect(TOME_PRINT_CSS).toContain(property);
		}
	});
});
