import './index.css';
import sos from '@signageos/front-applet';

// Wait on sos data are ready (https://developers.signageos.io/sdk/sos/#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root');
	if (contentElement) {
		console.log('sOS is ready');
		contentElement.innerHTML = 'Fetching location...<br/>';

		try {
			const location = await sos.deviceInfo.getLocation();
			contentElement.innerHTML += `Current Location: Latitude ${location?.name}<br/>`;
			if (location?.tags) {
				contentElement.innerHTML += `Tags: ${location?.tags?.join(', ')}<br/>`;
			}
		} catch (error) {
			contentElement.innerHTML += `Error fetching location: {error}<br/>`;
		}

		contentElement.innerHTML += 'Fetching device tags...<br/>';

		const tags = await sos.deviceInfo.getDeviceTags();
		if (tags) {
			contentElement.innerHTML += `Device Tags:<br/>`;
			tags.forEach((tag) => {
				contentElement.innerHTML += `- ${tag.name}<br/>`;
			});
		} else {
			contentElement.innerHTML += 'No device tags found.<br/>';
		}
	}
});
