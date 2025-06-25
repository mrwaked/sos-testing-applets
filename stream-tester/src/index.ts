
require('./index.css');

import sos from '@signageos/front-applet';

interface IStream {
	uid: string;
	uri: string;
	arguments?: [string, number, number, number, number, { protocol: string, autoReconnect: boolean, autoReconnectInterval: number }];
}

sos.onReady().then(async function () {
	const contentElement = document.getElementById('root');

	const uri = sos.config.uri || 'https://www.rmp-streaming.com/media/bbb-360p.mp4';
	const protocolType = sos.config.protocolType || 'HTTP'; // RTSP

	const stream: IStream = {
		uid: 'stream-1',
		uri
	};

	stream.arguments = [
		stream.uri,
		0,
		0,
		document.documentElement.clientWidth,
		document.documentElement.clientHeight,
		{
			protocol: protocolType,
			autoReconnect: true,
			autoReconnectInterval: 10000,
		}
	];

	contentElement.innerHTML = '';

	function streamEventListener ({type, srcArguments}) {
		contentElement.innerHTML += `Stream ${type}: ${srcArguments.uri}\n`;
	}

	sos.stream.onConnected(streamEventListener);
	sos.stream.onDisconnected(streamEventListener);
	sos.stream.onError(streamEventListener);
	sos.stream.onPrepare(streamEventListener);
	sos.stream.onPlay(streamEventListener);
	sos.stream.onStop(streamEventListener);

	// Play stream forever (https://developers.signageos.io/sdk/content/js-video-stream)
	await sos.stream.play(...stream.arguments);
});
