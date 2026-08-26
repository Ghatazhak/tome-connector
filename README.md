# Tome Connector

Tome Connector is an Obsidian plugin that sends selected note content to a
Tome server. Content is sent only when you select a **Send to Tome** button
or the character sync action.

## Requirements

- Obsidian 1.11.4 or later
- A reachable Tome server
- A Tome API key for the account receiving the content

## Installation

Copy these release files into `.obsidian/plugins/tome-connector/` in your
vault:

- `main.js`
- `manifest.json`
- `styles.css`

Reload Obsidian, then enable **Tome Connector** under
**Settings -> Community plugins**.

## Configuration

Open **Settings -> Tome Connector** and configure:

- **Tome base URL**: The server origin, such as `https://tome.example.com`.
  Do not include an API action path.
- **API key**: Select or create an entry in Obsidian SecretStorage. The key is
  sent in the `X-Api-Key` header and is not stored in the plugin's `data.json`.
- **Sync tag**: A tag such as `#tome`. Notes carrying it are included by the
  *Send notes with the sync tag to Tome* command. Leave it empty and that
  command hides itself; the folder and vault commands never consult it.
- **Downscale images before sending**: On by default. See below.

The API key determines the Tome account. Before every campaign-scoped import, the
connector loads that account's campaigns and asks which one should receive the content.
It sends the selected id in the `X-Campaign-Id` header.

### Image size

By default, pictures are shrunk to fit Tome before they are uploaded - maps to
3072px on the longest edge, tokens to 1024px, cover art to 1600px - and
re-encoded as WebP, but only when that actually produces a smaller file. An
image already inside its cap is sent exactly as it is, and so are GIFs and SVGs,
which lose too much to a canvas to be worth re-encoding.

Turn **Downscale images before sending** off to upload originals untouched.
Before you do, know what Tome accepts:

| What you are sending | Ceiling | What happens above it |
| --- | --- | --- |
| Map background | 50 MB | Refused, with a message |
| Prop | 5 MB | Refused, with a message |
| Statblock, character, item or adventure cover art | 5 MB | **The entry is created without its picture, and nothing says so** |

The last row is the one worth remembering: an oversized token or item
illustration does not fail the send, it just quietly does not arrive. The
setting says as much the moment you switch it off.

This setting covers uploads only. Compiling a folder into a PDF reference is a
separate feature with its own image handling, described under *Send a folder as
a PDF reference*, and is not affected either way.

## Supported Content

The plugin adds send controls for:

- Fantasy Statblocks `statblock` YAML blocks
- Encounter `encounter` YAML blocks
- Map View `zoommap` YAML blocks
- Prop `prop` YAML blocks
- Player-character note properties
- JSON blocks containing a top-level `tome` encounter object
- Whole folders, compiled into a single PDF reference (see below)
- Whole folders, imported as a Storybook adventure - see
  [`docs/authoring-adventures.md`](docs/authoring-adventures.md) for the format, whether the
  folder came from `ttrpg-convert-cli` or was written by hand

Example JSON encounter:

```json
{
  "tome": {
    "name": "Goblin ambush",
    "encounterNpcs": [
      { "name": "Goblin", "quantity": 4 }
    ]
  }
}
```

On creation, Tome Connector writes the returned ID back into encounter, NPC,
map, and prop source blocks. Player-character IDs are stored in the note's
`tome_id` frontmatter property. Later sends use those IDs where the API supports
identity-based updates.

### Send a folder as a PDF reference

Right-click a folder in the File Explorer and select **Send to Tome**. Every
note in the folder, including those in subfolders, is compiled into one PDF and
uploaded to the campaign's Reference library.

- Each note becomes a chapter that starts on a new page, and each subfolder
  becomes a part divider. The PDF's bookmark outline mirrors that structure,
  with each note's own headings nested beneath its chapter.
- Notes and folders are ordered as the File Explorer shows them, so `Chapter 2`
  comes before `Chapter 10`.
- Folders containing no notes, such as attachment folders, are skipped.
- Images and other attachments are resolved wherever they live in the vault and
  embedded in the PDF, so it is self-contained. They are first scaled down to
  fit 1600px on their longest edge - about 220 DPI across a Letter text column,
  past what the page can resolve - and re-encoded as JPEG. Artwork that is
  opaque apart from anti-aliased edges is flattened onto white, which the page
  already is; only images whose transparency is genuinely load-bearing, such as
  a cut-out token over a coloured callout, stay lossless PNG. An image is only
  replaced when the result is actually smaller, and SVGs are left as vector.
  The notice at the end reports the saving.
- The reference is named after the folder. Sending the same folder again
  replaces the existing reference rather than creating a second one.

Two limitations worth knowing:

- This action is **desktop only**. It prints through Chromium's PDF engine,
  which Obsidian's mobile app does not provide, so the menu item does not
  appear there. Every other feature of this plugin still works on mobile.
- The PDF is always rendered in the light theme. A dark theme prints as either
  a solid black page or near-invisible text.

## Data And Privacy

Tome Connector does not send data automatically. A send action transmits the
selected block, allowed character properties, or - for a folder export - the
rendered text of every note in the chosen folder to the configured Tome server.
Referenced images are read from the vault and embedded as base64 data. Unless
**Downscale images before sending** has been turned off, they are shrunk and
re-encoded first, so what reaches the server is smaller than what is in the
vault - see *Image size*. Nothing is uploaded to any third party at any point;
the resizing happens on your own machine, in Obsidian.

For block and character sends, a referenced image that cannot be read cancels
the request; local vault paths are not sent as a fallback. A folder export
instead drops the unreadable image and continues, marking the spot with a
"Missing attachment" placeholder that names only the link as written in the
note. A single stale link should not discard a book-length render, and because
the element is removed rather than left broken, no local filesystem path is
included either way. Unreadable images and notes are summarised in a notice and
listed in the developer console.

Images a note references by URL are left as URLs and are fetched by the PDF
renderer at print time, exactly as the reading view already fetches them.

Payloads and API keys are not written to the developer console. Failed server
responses may be logged to help diagnose API errors.

## Development

Install dependencies and run the checks from this directory:

```bash
npm ci
npm run build
npm test
npm run lint
```

Use `npm run dev` for a watch build. Production release artifacts are
`main.js`, `manifest.json`, and `styles.css`; `main.js` is generated and should
not be committed.

## Release

Keep the versions in `package.json`, `manifest.json`, and `versions.json`
aligned. Create a release tag matching the version exactly, without a `v`
prefix, and attach the three release artifacts individually.
