import './index.css';
import sos from '@signageos/front-applet';

// Wait on sos data are ready (https://docs.signageos.io/api/js/content/latest/js-applet-basics#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root')!;
	if (contentElement) {
		console.log('sOS is ready');
		contentElement.innerHTML = 'sOS is ready';
	}

	const url = sos.config.server_url as string;
	if (url) {
		console.log('Set device URL:', url);
		await sos.management.setExtendedManagementUrl(url.toString());
		contentElement.innerHTML += `<br>URL to set: ${url}`;
	} else {
		console.error('Device URL is not set in sos.config.server_url');
		contentElement.innerHTML += '<br>Error: URL is not set in config';
	}

	// wait 10s
	contentElement.innerHTML += '<br>Waiting 10 seconds for URL to be set...';
	await new Promise(resolve => setTimeout(resolve, 10000));

	const setUrl = await sos.management.getExtendedManagementUrl();
	contentElement.innerHTML += `<br>Device active URL: ${setUrl}`;
});
