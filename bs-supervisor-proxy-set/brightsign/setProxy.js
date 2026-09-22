/**
 * Sets or disables the device HTTP proxy through the management API and reports the state
 * before and after, so a silent no-op is distinguishable from a real write.
 *
 * On supervisor this exercises: sos.management.proxy.setManual -> BrightSignProxy ->
 * @brightsign/hostconfiguration applyConfig.
 */

async function readState() {
	// getBypassList only exists on builds that implement the bypass list; report null elsewhere
	// so the proxy checks still run instead of aborting on a missing method.
	const readBypassList =
		typeof sos.management.proxy.getBypassList === 'function' ? sos.management.proxy.getBypassList() : Promise.resolve(null);
	const [isEnabled, connectedTo, bypassList] = await Promise.all([
		sos.management.proxy.isEnabled(),
		sos.management.proxy.getConnectedTo(),
		readBypassList,
	]);
	return { isEnabled: isEnabled, connectedTo: connectedTo, bypassList: bypassList };
}

function describeError(error) {
	if (!error) {
		return null;
	}
	return error.message || String(error);
}

async function run() {
	const action = (config.action || 'enable').trim();
	const report = {
		action: action,
		requested: null,
		before: null,
		after: null,
		callResult: null,
		callError: null,
		changed: null,
		verdict: null,
	};

	try {
		report.before = await readState();
	} catch (error) {
		report.callError = 'reading state before failed: ' + describeError(error);
		postResult(JSON.stringify(report, null, 2));
		return;
	}

	try {
		if (action === 'disable') {
			await sos.management.proxy.disable();
			report.callResult = 'disable() resolved';
		} else {
			const uri = config.uri;
			const port = config.port;
			if (!uri || !port) {
				report.callError = 'action=enable requires both uri and port';
				postResult(JSON.stringify(report, null, 2));
				return;
			}
			// Credentials are optional; the driver omits them unless both are present.
			const username = config.username || '';
			const password = config.password || '';
			// Split only — entries are passed through unnormalized on purpose, so the after-state
			// shows whether the driver trimmed them and dropped the empty ones.
			const bypassList = config.bypassList ? String(config.bypassList).split(',') : [];
			report.requested = {
				uri: uri,
				port: String(port),
				hasCredentials: Boolean(username && password),
				bypassList: bypassList,
			};
			await sos.management.proxy.setManual(uri, String(port), username, password, bypassList);
			report.callResult = 'setManual() resolved';
		}
	} catch (error) {
		// Expected when the platform cannot apply the proxy — previously this was swallowed and
		// reported as success, which is exactly what this script is here to detect.
		report.callError = describeError(error);
	}

	try {
		report.after = await readState();
	} catch (error) {
		report.callError = (report.callError ? report.callError + ' | ' : '') + 'reading state after failed: ' + describeError(error);
	}

	if (report.before && report.after) {
		report.changed =
			report.before.connectedTo !== report.after.connectedTo ||
			report.before.isEnabled !== report.after.isEnabled ||
			JSON.stringify(report.before.bypassList) !== JSON.stringify(report.after.bypassList);
		if (report.callError) {
			report.verdict = report.changed ? 'FAILED LOUDLY BUT STATE CHANGED — inconsistent' : 'FAILED LOUDLY, state unchanged — honest error';
		} else {
			report.verdict = report.changed ? 'APPLIED — state changed as requested' : 'SILENT NO-OP — call succeeded but nothing changed';
		}
	}

	postResult(JSON.stringify(report, null, 2));
}

run();
