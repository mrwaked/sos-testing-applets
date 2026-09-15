import './index.css';
import sos from '@signageos/front-applet';

// Wait on sos data are ready (https://developers.signageos.io/sdk/sos/#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root')!;
	if (contentElement) {
		console.log('sOS is ready');
		contentElement.innerHTML = 'sOS is ready</br></br>';
	}

	// Setup proxy (https://docs.signageos.io/sdk/sos_management/proxy)
	const uri = sos.config.uri as string | undefined;
	const port = Number(sos.config.port);
	const username = sos.config.username as string | undefined;
	const password = sos.config.password as string | undefined;

	if (!uri) {
		console.error('Proxy uri is not specified in the applet configuration');
		contentElement.innerHTML += 'Error: Proxy uri is not specified in the applet configuration</br>';
		return;
	}
	if (!sos.config.port || isNaN(port)) {
		console.error('Proxy port is not a valid number in the applet configuration');
		contentElement.innerHTML += 'Error: Proxy port is not a valid number in the applet configuration</br>';
		return;
	}

	try {
		const enabledBefore = await sos.management.proxy.isEnabled();
		contentElement.innerHTML += `Proxy enabled before setup: ${enabledBefore}</br>`;
		if (enabledBefore) {
			const connectedToBefore = await sos.management.proxy.getConnectedTo();
			contentElement.innerHTML += `Currently connected to: ${connectedToBefore}</br>`;
		}

		contentElement.innerHTML += `Setting manual proxy ${uri}:${port}${username ? ' with authentication' : ''}...</br>`;
		await sos.management.proxy.setManual(uri, port, username, password);
		console.log('Proxy set successfully');
		contentElement.innerHTML += 'Proxy set successfully</br>';

		const enabledAfter = await sos.management.proxy.isEnabled();
		contentElement.innerHTML += `Proxy enabled: ${enabledAfter}</br>`;
		const connectedToAfter = await sos.management.proxy.getConnectedTo();
		contentElement.innerHTML += `Connected to: ${connectedToAfter}</br>`;
	} catch (error) {
		console.error('Failed to setup proxy', error);
		contentElement.innerHTML += 'Error: Failed to setup proxy</br>' + JSON.stringify(error) + '</br>';
	}
});
