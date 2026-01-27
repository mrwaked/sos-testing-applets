import './index.css';
import sos from '@signageos/front-applet';

// Memory storage for allocated data
const memoryChunks: string[] = [];
let totalAllocatedMB = 0;
let CHUNK_SIZE_MB = 10; // Default: Allocate 10MB per iteration
let INTERVAL_MS = 10000; // Default: 10 seconds

/**
 * Creates a string of approximately the specified size in MB
 */
function createMemoryChunk(sizeInMB: number): string {
	const bytes = sizeInMB * 1024 * 1024;
	const chars = bytes / 2; // Each character is approximately 2 bytes in JS
	return 'X'.repeat(chars);
}

/**
 * Allocates memory and updates the UI
 */
function allocateMemory(): void {
	try {
		console.log(`Allocating ${CHUNK_SIZE_MB}MB of memory...`);
		const chunk = createMemoryChunk(CHUNK_SIZE_MB);
		memoryChunks.push(chunk);
		totalAllocatedMB += CHUNK_SIZE_MB;

		updateUI();
		console.log(`Total allocated: ${totalAllocatedMB}MB (${memoryChunks.length} chunks)`);
	} catch (error) {
		console.error('Failed to allocate memory:', error);
		updateUI(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Updates the UI with current memory status
 */
function updateUI(errorMessage?: string): void {
	const contentElement = document.getElementById('root');
	if (contentElement) {
		contentElement.innerHTML = `
			<div style="padding: 20px; font-family: Arial, sans-serif;">
				<h1>Memory Filler Test</h1>
				<div style="margin: 20px 0;">
					<p><strong>Total Allocated:</strong> ${totalAllocatedMB} MB</p>
					<p><strong>Number of Chunks:</strong> ${memoryChunks.length}</p>
					<p><strong>Chunk Size:</strong> ${CHUNK_SIZE_MB} MB</p>
					<p><strong>Interval:</strong> ${INTERVAL_MS / 1000} seconds</p>
				</div>
				${errorMessage ? `<div style="color: red; margin: 10px 0;"><strong>${errorMessage}</strong></div>` : ''}
				<div style="margin-top: 20px;">
					<button id="stopBtn" style="padding: 10px 20px; font-size: 16px; margin-right: 10px;">Stop Filling</button>
					<button id="clearBtn" style="padding: 10px 20px; font-size: 16px; background-color: #dc3545; color: white;">Clear Memory</button>
				</div>
			</div>
		`;

		// Add event listeners
		const stopBtn = document.getElementById('stopBtn');
		const clearBtn = document.getElementById('clearBtn');

		if (stopBtn) {
			stopBtn.addEventListener('click', () => {
				if (intervalId !== null) {
					clearInterval(intervalId);
					intervalId = null;
					console.log('Memory filling stopped');
					stopBtn.textContent = 'Stopped';
					stopBtn.setAttribute('disabled', 'true');
				}
			});
		}

		if (clearBtn) {
			clearBtn.addEventListener('click', () => {
				memoryChunks.length = 0; // Clear the array
				totalAllocatedMB = 0;
				console.log('Memory cleared');
				updateUI();
			});
		}
	}
}

let intervalId: NodeJS.Timeout | null = null;

// Wait on sos data are ready (https://developers.signageos.io/sdk/sos/#onready)
sos.onReady().then(async function () {
	console.log('sOS is ready');

	// Read config values
	CHUNK_SIZE_MB = (sos.config?.chunkSizeMB as number) ?? 10;
	INTERVAL_MS = (sos.config?.intervalMS as number) ?? 10000;

	// Initial UI update
	updateUI();

	// Start memory allocation
	console.log(`Starting memory allocation: ${CHUNK_SIZE_MB}MB every ${INTERVAL_MS / 1000} seconds`);

	// Allocate first chunk immediately
	allocateMemory();

	// Continue allocating every 10 seconds
	intervalId = setInterval(() => {
		allocateMemory();
	}, INTERVAL_MS);
});
