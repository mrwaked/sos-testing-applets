async function collectDeviceInfo() {
	const [model, serial, firmware, os, volume] = await Promise.all([
		sos.management.getModel(),
		sos.management.getSerialNumber(),
		sos.management.firmware.getVersion(),
		sos.management.os.getInfo(),
		sos.management.audio.getVolume(),
	]);
	return { model, serial, firmware, os, volume };
}
module.exports = { collectDeviceInfo };
