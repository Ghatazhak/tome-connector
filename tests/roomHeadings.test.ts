import { describe, expect, it } from 'vitest';

import { asRoomHeading } from '../src/adventure/roomHeadings';

describe('asRoomHeading', () => {
	it('reads a colon-separated named room', () => {
		expect(asRoomHeading('B1: Entrance Tunnel')).toEqual({ label: 'B1', name: 'Entrance Tunnel' });
	});

	it('reads a period-separated named room', () => {
		expect(asRoomHeading('5A. Southwest Garden')).toEqual({ label: '5A', name: 'Southwest Garden' });
	});

	it('reads a parenthesis-separated named room', () => {
		expect(asRoomHeading('Q1) The Guard Post')).toEqual({ label: 'Q1', name: 'The Guard Post' });
	});

	it('reads letter-digit-letter labels', () => {
		expect(asRoomHeading('E5b: Storage')).toEqual({ label: 'E5b', name: 'Storage' });
		expect(asRoomHeading('N3s: Cistern')).toEqual({ label: 'N3s', name: 'Cistern' });
		expect(asRoomHeading('D35: Vault')).toEqual({ label: 'D35', name: 'Vault' });
	});

	it('reads a bare labelled heading, naming it after itself', () => {
		expect(asRoomHeading('25A')).toEqual({ label: '25A', name: '25A' });
		expect(asRoomHeading('9')).toEqual({ label: '9', name: '9' });
	});

	it('requires a separator, so a bare number-first heading does not become a room', () => {
		expect(asRoomHeading('36 Sled Dogs')).toBeNull();
	});

	it('restricts the prefix to A-Z, so an ordinal heading does not become a room', () => {
		expect(asRoomHeading('2nd-Level Characters')).toBeNull();
	});

	it('requires text after the separator', () => {
		expect(asRoomHeading('5.')).toBeNull();
		expect(asRoomHeading('5. ')).toBeNull();
	});

	it('rejects a heading with more than three digits', () => {
		expect(asRoomHeading('B1234: Too Big')).toBeNull();
	});

	it('rejects ordinary prose headings', () => {
		expect(asRoomHeading('Wandering Monsters')).toBeNull();
		expect(asRoomHeading('Cragmaw Hideout')).toBeNull();
	});
});
