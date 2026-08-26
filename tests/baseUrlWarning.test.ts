import { describe, expect, it } from 'vitest';
import { baseUrlWarning } from '../src/tomeBaseUrl';

/**
 * The API key travels in an X-Api-Key header on every request, so the transport the base URL
 * names decides whether it is readable by anyone on the path. Nothing validated it, and the
 * settings field accepted any string.
 */
describe('baseUrlWarning', () => {
	it('is quiet about https', () => {
		expect(baseUrlWarning('https://tome.example.com')).toBeNull();
		expect(baseUrlWarning('https://tome.example.com:8443/')).toBeNull();
	});

	it('is quiet about an empty field, which is just an unconfigured plugin', () => {
		expect(baseUrlWarning('')).toBeNull();
		expect(baseUrlWarning('   ')).toBeNull();
	});

	it('warns that http sends the key in clear text', () => {
		const warning = baseUrlWarning('http://tome.example.com');
		expect(warning).toContain('clear text');
	});

	// Loopback never leaves the machine, so warning about it would be noise - and someone
	// running Tome locally over http is doing nothing wrong.
	it('allows http on loopback', () => {
		expect(baseUrlWarning('http://localhost:7151')).toBeNull();
		expect(baseUrlWarning('http://127.0.0.1:7151')).toBeNull();
		expect(baseUrlWarning('http://[::1]:7151')).toBeNull();
	});

	it('still warns about http on a host that merely looks local', () => {
		// A hostname containing "localhost" is not loopback, and resolves wherever DNS says.
		expect(baseUrlWarning('http://localhost.evil.example')).toContain('clear text');
	});

	it('says so when the value is not a URL at all', () => {
		expect(baseUrlWarning('tome.example.com')).toContain('https://');
		expect(baseUrlWarning('not a url')).toContain('https://');
	});

	it('rejects a scheme that is neither http nor https', () => {
		expect(baseUrlWarning('ftp://tome.example.com')).toContain('https://');
	});
});
