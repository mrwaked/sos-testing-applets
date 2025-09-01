import './index.css';
import sos from '@signageos/front-applet';
import '../lib/idcap'; // Import idcap.js
import '../lib/cordova/2.7.0/cordova.webos';
import '../lib/cordova-cd/signage'
import '../lib/cordova-cd/deviceInfo';
import '../lib/cordova-cd/iot';
import '../lib/cordova-cd/time';
import '../lib/cordova-cd/video';
import '../lib/cordova-cd/configuration';
import '../lib/cordova-cd/inputSource';
import '../lib/cordova-cd/power';
import '../lib/cordova-cd/security';
import '../lib/cordova-cd/sound';
import '../lib/cordova-cd/storage';
import '../lib/cordova-cd/utility';

// Wait on sos data are ready (https://docs.signageos.io/api/js/content/latest/js-applet-basics#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root');
	console.log('sOS is ready');

	function failureCb(cbObject) {
		var errorCode = cbObject.errorCode;
		var errorText = cbObject.errorText;
		contentElement.innerHTML += "Error Code [" + errorCode + "]: " + errorText;
	}

	function successCb(cbObject) {
		contentElement.innerHTML += "cbObject : " + JSON.stringify(cbObject);
	}

	var sound = new Sound();
	sound.getSoundStatus(successCb, failureCb);
});
