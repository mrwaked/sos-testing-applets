const value = config.brightness;

async function run() {
	const [model, fw, cpu, mem, vol, brightness, net] = await Promise.all([
		sos.management.getModel(),
		sos.management.firmware.getVersion(),
		sos.management.os.getCpuUsage(),
		sos.management.os.getMemoryUsage(),
		sos.management.audio.getVolume(),
		sos.management.screen.getBrightness(),
		sos.management.network.getActiveInfo(),
	]);
	postResult(JSON.stringify({ model, fw, cpu, mem, vol, brightness, net }, null, 2));
}

run();
