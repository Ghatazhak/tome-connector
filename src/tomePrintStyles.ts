/**
 * Stylesheet injected into the print guest, appended after Obsidian's own
 * head so these rules win over the active theme and any snippets.
 *
 * Kept as a plain string rather than in `styles.css`: `styles.css` is loaded
 * into Obsidian's own document, whereas this has to travel into a separate
 * `<webview>` document that shares none of it.
 */
export const TOME_PRINT_CSS = `
/* Obsidian's app.css styles the document as an application shell: a
   fixed-position, viewport-sized, overflow-hidden body that must never
   scroll. Those rules travel into the print guest along with the rest of the
   copied <head>, and they clip the document to a single viewport - which
   prints as a stack of blank pages. Undoing them is what makes the content
   paginate at all, so these declarations are load-bearing.

   Chromium's print box already carries the page margins, so the document
   itself must not add another gutter either. */
html,
body {
	position: static !important;
	display: block !important;
	width: auto !important;
	height: auto !important;
	min-height: 0 !important;
	max-height: none !important;
	overflow: visible !important;
	/* Load-bearing. The app shell applies CSS containment to the document so
	   Chromium can skip work outside the window. Under contain:size the body
	   is laid out as though it had no contents - it measures 0px tall however
	   long the book is - and contain:paint then clips everything to that empty
	   box. The result is a document Chromium believes is one viewport tall: a
	   correctly generated PDF with nothing on the pages. */
	contain: none !important;
	content-visibility: visible !important;
	margin: 0;
	padding: 0;
	background: #fff;
}

/* Same story one level down: the reading view is a scroll region sized to
   its pane, and contain/content-visibility let the renderer skip laying out
   anything currently off-screen - which on paper is most of the book. */
.tome-export-root,
.tome-export-root .markdown-preview-sizer,
.markdown-preview-view,
.markdown-rendered {
	position: static !important;
	height: auto !important;
	min-height: 0 !important;
	max-height: none !important;
	overflow: visible !important;
	contain: none !important;
	content-visibility: visible !important;
	max-width: none;
	padding: 0;
	margin: 0;
}

/* The app shell also lays its children out as flex items, which would size
   the whole book to whatever space one pane had. */
.tome-export-root {
	display: block !important;
	visibility: visible !important;
	opacity: 1 !important;
	flex: none !important;
	width: auto !important;
	/* Anything that takes the book out of normal flow leaves the body with
	   nothing to be sized by, which collapses the document the same way
	   containment does. */
	float: none !important;
	position: static !important;
}

.tome-export-root * {
	contain: none !important;
	content-visibility: visible !important;
}

/* Decorative effects that force Chromium to rasterize.

   Load-bearing for file size, not for looks. Any of these properties makes a
   region impossible to draw as vector, so the print pipeline flattens it to a
   lossless bitmap at print resolution and embeds that instead. On a themed
   book the result is page-sized FlateDecode images with alpha - measured at
   roughly 1.5 MB for a single page-sized region, dwarfing the actual artwork
   and completely outside the image optimizer's reach.

   Only decorative properties are listed: none of them affect layout, so text
   still lays out and prints as selectable vector text. */
.tome-export-root,
.tome-export-root * {
	filter: none !important;
	backdrop-filter: none !important;
	-webkit-backdrop-filter: none !important;
	mix-blend-mode: normal !important;
	box-shadow: none !important;
	text-shadow: none !important;
	mask: none !important;
	-webkit-mask: none !important;
	clip-path: none !important;
	will-change: auto !important;
}

/* Every note, and every subfolder title, opens a new page - except the very
   first, which would otherwise leave a blank leading page. */
.tome-chapter,
.tome-group {
	break-before: page;
}
.tome-export-root > :first-child {
	break-before: auto;
}

/* Keep a heading with the text it introduces. */
.tome-chapter-title,
.tome-group-title,
h1, h2, h3, h4, h5, h6 {
	break-after: avoid;
	break-inside: avoid;
}

/* A subfolder title is a part divider, so give it room. */
.tome-group-title {
	margin-top: 0;
	padding-top: 2em;
}

/* Images and block-level widgets read badly when split across a page. */
img,
svg,
table,
pre,
blockquote,
.callout,
.internal-embed {
	break-inside: avoid;
}

img,
svg {
	max-width: 100%;
	height: auto;
}

/* Tables default to the reading view's scroll container, which clips columns
   when there is no scrollbar to drag. */
table {
	width: 100%;
	table-layout: auto;
}
.markdown-rendered .table-wrapper,
.markdown-rendered .table-view-table {
	overflow: visible !important;
}

/* Long code lines are clipped rather than wrapped in the reading view. */
pre,
code {
	white-space: pre-wrap;
	word-break: break-word;
}

/* Interactive chrome that Obsidian renders into the preview but which means
   nothing on paper. */
.edit-block-button,
.copy-code-button,
.markdown-preview-pusher,
.collapse-indicator,
.frontmatter,
.metadata-container {
	display: none !important;
}

/* Collapsed callouts and folded sections must print expanded. */
.callout.is-collapsed .callout-content,
.markdown-rendered .is-collapsed > *:not(.heading-collapse-indicator) {
	display: revert !important;
}

.tome-missing-attachment {
	display: inline-block;
	padding: 0.15em 0.5em;
	border: 1px dashed #b0b0b0;
	border-radius: 4px;
	color: #8a8a8a;
	font-size: 0.85em;
	font-style: italic;
}

.tome-render-error {
	color: #8a8a8a;
	font-style: italic;
}
`;
