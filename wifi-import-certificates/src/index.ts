import { EAPMethod } from '@signageos/front-applet/es6/FrontApplet/Management/Wifi/IWifi';
import './index.css';
import sos from '@signageos/front-applet';

// Wait on sos data are ready (https://docs.signageos.io/api/js/content/latest/js-applet-basics#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root')!;
	if (contentElement) {
		console.log('sOS is ready');
		contentElement.innerHTML = 'sOS is ready</br></br>';
	}

	// Import certificates (https://docs.signageos.io/sdk/sos_management/network)
	const authType = sos.config.authType as EAPMethod;
	const caCertificate = sos.config.caCertificate as string | undefined;
	const clientCertificate = sos.config.clientCertificate as string | undefined;
	const clientKey = sos.config.clientKey as string | undefined;

	if (!authType) {
		console.error('Authentication type is not specified in the applet configuration');
		contentElement.innerHTML += 'Error: Authentication type is not specified in the applet configuration</br>';
		return;
	}

	if (authType === 'TTLS' || authType === 'PEAP') {
		if (!caCertificate) {
			console.error('CA certificate is required for TTLS and PEAP authentication types');
			contentElement.innerHTML += 'Error: CA certificate is required for TTLS and PEAP authentication types</br>';
			return;
		}
	}
	if (authType === 'TLS') {
		if (!caCertificate || !clientCertificate || !clientKey) {
			console.error('CA certificate, client certificate and client key are required for TLS authentication type');
			contentElement.innerHTML += 'Error: CA certificate, client certificate and client key are required for TLS authentication type</br>';
			return;
		}
	}

	try {
		contentElement.innerHTML += 'Importing certificates... for ' + authType + '</br>';
		await sos.management.network.importCertificate({
			type: authType,
			caCertificate,
			clientCertificate,
			clientKey,
		});
		console.log('Certificates imported successfully');
		contentElement.innerHTML += 'Certificates imported successfully</br>';
	} catch (error) {
		console.error('Failed to import certificates', error);
		contentElement.innerHTML += 'Error: Failed to import certificates</br>' + JSON.stringify(error) + '</br>';
	}
});
