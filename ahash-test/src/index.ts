import './index.css';
import sos from '@signageos/front-applet';

// Wait on sos data are ready (https://developers.signageos.io/sdk/sos/#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root');
	if (contentElement) {
		console.log('sOS is ready');
		contentElement.innerHTML = 'Ready to take screenshots (upload server: https://upload.signageos.io).<br/>';

		const { screenshotUrl, aHash } = await sos.management.screen.takeAndUploadScreenshot('https://upload.signageos.io', {
			computeHash: true,
		});

		contentElement.innerHTML += `Screenshot URL: <a href="${screenshotUrl}" target="_blank">${screenshotUrl}</a><br/>`;
		contentElement.innerHTML += `aHash: ${aHash}<br/>`;
	}
});
