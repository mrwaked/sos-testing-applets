
require('./index.css');

import sos from '@signageos/front-applet';

// Wait on sos data are ready (https://docs.signageos.io/api/js/content/latest/js-applet-basics#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root');
	console.log('sOS is ready');
	contentElement.innerHTML = 'sOS is ready';
	const buttonElement = document.getElementById('open-osd');
	buttonElement.focus();
	buttonElement.autofocus = true;
	buttonElement.addEventListener('click', async (event) => {
		event.preventDefault();
		console.log('button - open osd pre-open');
		await sos.osd.showOSD();
		console.log('button - open osd clicked');

		contentElement.innerHTML = `OSD OPENED.`;
	});
});
