const { collectDeviceInfo } = require('./lib/device');
const { summarize } = require('./lib/format');

(async () => {
	try {
		const info = await collectDeviceInfo();
		const result = summarize(info, config);
		postResult(JSON.stringify(result));
	} catch (err) {
		postResult('ERROR: ' + (err && err.message ? err.message : String(err)));
	}
})();
