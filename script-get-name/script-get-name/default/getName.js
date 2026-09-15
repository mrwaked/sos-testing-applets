console.log('Calling scriptik');

sos.deviceInfo.getDeviceName()
	.then((result) => {
		console.log('ok', result);
		console.log(window);
		postResult(result);
	})
	.catch((e) => console.error('failed', e));