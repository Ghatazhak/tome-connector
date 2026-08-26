/**
 * Pulls the human-readable half of a Tome error response out of its body.
 *
 * The server refuses things for reasons the person syncing can act on - "more
 * than one player character in this campaign is called 'Alanna'", "you have
 * reached the map limit for your plan" - and every one of those arrives as a
 * ProblemDetails `detail`. Without this the connector could only say "server
 * responded with status 409", which tells you a sync failed and nothing about
 * what to do next.
 *
 * Handles the three shapes the server actually produces:
 *
 * - ProblemDetails (`{ title, detail, status, code? }`) - the mapped exceptions,
 *   which is nearly all of them. `detail` is the sentence worth showing; `title`
 *   is a category ("Resource is in use.") and is the fallback.
 * - `ApiMessageDto` (`{ message, code? }`) - what the controllers return for a
 *   refusal they shape themselves.
 * - A bare string, or something unparseable, which is returned as-is so a plain
 *   text error is not swallowed.
 *
 * Returns null when there is nothing worth putting in front of someone, so the
 * caller can fall back to the status code rather than showing an empty notice.
 */
export function extractErrorMessage(rawText: string): string | null {
	const trimmed = rawText.trim();
	if (!trimmed) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		// Not JSON. Whatever it is, it is what the server said - but cap it, since
		// an HTML error page would otherwise become the notice.
		return truncate(trimmed);
	}

	if (typeof parsed === 'string') return truncate(parsed) || null;
	if (typeof parsed !== 'object' || parsed === null) return null;

	const body = parsed as Record<string, unknown>;
	// detail before message before title: most specific first, and title is a
	// category rather than an explanation.
	for (const key of ['detail', 'message', 'title']) {
		const value = body[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return truncate(value.trim());
		}
	}

	return null;
}

/** Notices are transient and one-line; a wall of text in one is unreadable. */
function truncate(value: string): string {
	const limit = 300;
	return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}
