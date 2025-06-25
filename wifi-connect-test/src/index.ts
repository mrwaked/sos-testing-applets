import './index.css';
import sos from '@signageos/front-applet';
import { WifiEncryptionType } from "@signageos/front-applet/es6/FrontApplet/Management/Wifi/IWifi";
import { INetworkInterface } from "@signageos/front-applet/es6/FrontApplet/Management/Network/INetworkInfo";

// Wait on sos data are ready (https://docs.signageos.io/api/js/content/latest/js-applet-basics#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root')!;

	const activeInterfaces = await sos.management.network.listInterfaces();
	if (activeInterfaces.length > 0) {
		contentElement.innerHTML = '<h3>Active network interfaces:</h3>';
		activeInterfaces.forEach((iface: INetworkInterface) => {
			contentElement.innerHTML += `<p>${iface.name} (${iface.type}) - IP: ${iface.localAddress} / ${iface.macAddress}</p>`;
		});
	} else {
		contentElement.innerHTML = '<p>No active network interfaces found.</p>';
	}

	if (activeInterfaces.some(iface => iface.type === 'wifi' && iface.wifiSsid)) {
		contentElement.innerHTML += '<p>Connected to Wi-Fi, please disconnect manually from device settings to process this applet.</p>';
		return;
	}

	contentElement.innerHTML += '<p>Connecting to Wi-Fi...</p>';

	const connectToWifi = sos.config.wifiName as string;
	const connectToPassword = sos.config.wifiPassword as string | undefined;
	const wifiEncryption = sos.config.wifiEncryption as WifiEncryptionType;

	if (connectToWifi && connectToPassword) {
		contentElement.innerHTML += `<p>Connecting to Wi-Fi: ${connectToWifi} / ${connectToPassword} / ${wifiEncryption}</p>`;
		try {
			await sos.management.wifi.connect(connectToWifi, connectToPassword, { securityType: wifiEncryption });
		} catch (error) {
			contentElement.innerHTML += `<p>Error connecting to Wi-Fi: ${error}</p>`;
			console.error('Error connecting to Wi-Fi:', error);
			return;
		}
	} else if (typeof connectToPassword === 'undefined') {
		contentElement.innerHTML += `<p>Connecting to open Wi-Fi: ${connectToWifi} with no password / ${wifiEncryption}</p>`;
		try {
			await sos.management.wifi.connect(connectToWifi, undefined, { securityType: wifiEncryption });
		} catch (error) {
			contentElement.innerHTML += `<p>Error connecting to open Wi-Fi: ${error}</p>`;
			console.error('Error connecting to open Wi-Fi:', error);
			return;
		}
	}
});
