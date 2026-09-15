function summarize(info, config) {
	return {
		ok: true,
		label: (config && config.label) || '(no label provided)',
		device: { model: info.model, serial: info.serial, firmware: info.firmware, os: info.os, volume: info.volume },
		requiredFiles: ['index.js', 'lib/device.js', 'lib/format.js'],
	};
}
module.exports = { summarize };
