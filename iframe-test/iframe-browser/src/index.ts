import './index.css';
import sos from '@signageos/front-applet';

// Wait on sos data are ready (https://developers.signageos.io/docs/applets/getting-started/)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root');

	const url: string | undefined = sos.config.url as string | undefined || 'https://www.signageos.io';
	if (typeof url !== 'string') {
		contentElement!.innerHTML = 'Invalid URL type in applet configuration';
		return;
	}

	sos.browser.open(url, {
		//aclDomains: ['/^https?:\/\/.*\.google\.\w+(\/.*)?$/'],
		//aclMode: 'blacklist', // or 'whitelist'
		//readOnlyAddressBar: true,
		idleTimeout: 30e3 // milliseconds
	});
});
