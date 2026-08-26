export function extractResponseId(rawText: string): string | null {
	const trimmed = rawText.trim();
	if (!trimmed) return null;

	try {
		const parsedBody: unknown = JSON.parse(trimmed);
		if (typeof parsedBody === 'string') return parsedBody || null;
		if (typeof parsedBody !== 'object' || parsedBody === null) return null;

		const body = parsedBody as Record<string, unknown>;
		const responseId = body.id ?? body.Id;
		return typeof responseId === 'string' && responseId.length > 0
			? responseId
			: null;
	} catch {
		return trimmed;
	}
}
