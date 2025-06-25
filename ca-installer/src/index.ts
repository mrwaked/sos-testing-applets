import './index.css';
import sos from '@signageos/front-applet';

// Wait on sos data are ready (https://docs.signageos.io/api/js/content/latest/js-applet-basics#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root');
	if (contentElement) {
		console.log('sOS is ready');
		contentElement.innerHTML = 'sOS is ready';

		const version = sos.config.version as string;
		const installedVersion = await sos.management.app.getVersion();
		if (installedVersion === version) {
			contentElement.innerHTML += `<br>Current version is already installed: ${installedVersion}`;
			return;
		}
		if (version) {
			contentElement.innerHTML += `<br>Version to install: ${version}`;
		} else {
			contentElement.innerHTML += '<br>Error: Version is not set in config';
			return;
		}

		// wait 5s
		await new Promise(resolve => setTimeout(resolve, 5000));

		await sos.management.app.upgrade(version.toString());
		await sos.management.power.systemReboot();
	}
});
