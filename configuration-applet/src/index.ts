import './index.css';
import sos from '@signageos/front-applet';

// Wait on sos data are ready (https://docs.signageos.io/api/js/content/latest/js-applet-basics#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root');
	if (contentElement) {
		contentElement.innerHTML = '<h3>List of set applet configuration:</h3>';
		const configuration = sos.config;
		if (!configuration) {
			contentElement.innerHTML += '<p>No configuration set.</p>';
			return;
		}
		for (const key in configuration) {
			const value = configuration[key];
			const itemElement = document.createElement('div');
			itemElement.className = 'config-item';
			itemElement.innerHTML = `<strong>${key}:</strong> ${JSON.stringify(value)}`;
			contentElement.appendChild(itemElement);
			contentElement.appendChild(document.createElement('br'));
		}
	}
});
