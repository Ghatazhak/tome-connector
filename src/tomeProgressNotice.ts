import { Notice } from 'obsidian';

/**
 * A `Notice` with a visual progress bar appended beneath its text, for a run
 * long enough to be worth watching rather than a static "please wait".
 *
 * Obsidian's `Notice` has no progress API of its own, so this appends a bare
 * `<progress>` element straight into `containerEl` - public since 1.8.7 for
 * exactly this kind of customization. It goes in `containerEl` rather than
 * `messageEl`: `setMessage` is documented to replace the message, and a bar
 * living inside the element it replaces would vanish on the next update.
 *
 * A `<progress>` with no `value` attribute is natively indeterminate (the
 * animated stripe browsers already know how to draw), which is what
 * `setProgress` falls back to whenever a stage has no item count of its own -
 * "building the PDF" has no meaningful N of M, but the bar still says "this
 * is still running" rather than going silent.
 */
export class TomeProgressNotice {
	private readonly notice: Notice;
	private readonly bar: HTMLProgressElement;

	constructor(message: string) {
		this.notice = new Notice(message, 0);
		this.bar = this.notice.containerEl.createEl('progress', {
			cls: 'tome-connector-progress-bar',
		});
	}

	setMessage(message: string): void {
		this.notice.setMessage(message);
	}

	/** Omit or pass a non-positive `total` for an indeterminate stage. */
	setProgress(done: number, total = 0): void {
		if (total <= 0) {
			this.bar.removeAttribute('value');
			return;
		}
		this.bar.max = total;
		this.bar.value = done;
	}

	hide(): void {
		this.notice.hide();
	}
}
