// Gong for the record fanfare; the element is created up front so the file is fetched before it is needed.
let gong: HTMLAudioElement | null = null;

export function initSound(url: string): void {
	gong = document.createElement('audio');
	gong.src = url;
	gong.preload = 'auto';
	gong.volume = 0.8;
	document.body.appendChild(gong);
}

export function playGong(): void {
	if (!gong) {
		return;
	}
	gong.currentTime = 0;
	const result: unknown = gong.play();
	if (result && typeof (result as Promise<void>).then === 'function') {
		(result as Promise<void>).then(undefined, (error: Error) => {
			console.warn('[sabinovka] gong blocked', error && error.name, error && error.message);
		});
	}
}
