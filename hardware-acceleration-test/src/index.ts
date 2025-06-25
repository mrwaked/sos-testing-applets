
require('./index.css');

import sos from '@signageos/front-applet';

// Wait on sos data are ready (https://docs.signageos.io/api/js/content/latest/js-applet-basics#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('hwz-supported');

	const isSupported = await isHardwareAccelerationSupported();
	contentElement.innerHTML = isSupported ? 'Is HW acceleration supported? - Yes' : 'Is HW acceleration supported? - No';

	const contentStatus = document.getElementById('status');
	const isEnabled = await sos.management.isHardwareAccelerationEnabled();
	contentStatus.innerHTML = isEnabled ? 'Status: Enabled' : 'Status: Disabled';

	const toggleButton = document.getElementById('hwz-button');
	toggleButton.innerHTML = isEnabled ? 'Disable HW acceleration' : 'Enable HW acceleration';
	toggleButton.addEventListener('click', async function() {
		await sos.management.setHardwareAcceleration(!isEnabled);
		contentStatus.innerHTML = 'Reboot the device to apply changes';
	});

	const restartButton = document.getElementById('restart-button');
	restartButton.addEventListener('click', async function() {
		await sos.management.power.systemReboot();
	});

});

async function isHardwareAccelerationSupported() {
	return await sos.management.supports('HARDWARE_ACCELERATION');
}
