// legacy devices require ES5-compatible syntax
// beware or using "modern" javascript if you want your script to be generally applicable

/*
 * The custom script runtime treats a missing postResult as a success once its own
 * timeout elapses, so every terminating path here has to report - otherwise a failed
 * configuration is indistinguishable from a successful one in execution history.
 * postResult also terminates the script immediately, so the reboot has to be
 * requested before the result is posted.
 */

// Force the report to settle even if a DWS promise never resolves (ms).
var WATCHDOG_MS = 20000;

var finished = false;
var watchdog = null;

/** Reports the outcome exactly once and cancels the watchdog. */
function report(message) {
	if (finished) {
		return;
	}
	finished = true;
	if (watchdog !== null) {
		clearTimeout(watchdog);
		watchdog = null;
	}
	postResult(message);
}

/** Normalises a rejection or a thrown value to readable text. */
function errorText(error) {
	if (error && error.message) {
		return error.message;
	}
	if (error) {
		return JSON.stringify(error);
	}
	return "unknown error";
}

function rebootAndReport() {
	if (!sos.management || !sos.management.power || typeof sos.management.power.systemReboot !== "function") {
		report("Configuration applied. Automatic reboot is unavailable - reboot the device manually to apply the changes.");
		return;
	}

	// Fire the reboot request and report in the same tick - awaiting the promise would
	// lose the result, because the device may already be shutting down when it settles.
	try {
		sos.management.power.systemReboot().catch(function (error) {
			console.log("Error requesting reboot: " + JSON.stringify(error));
		});
	} catch (e) {
		report("Configuration applied, but the reboot request failed (" + errorText(e)
			+ "). Reboot the device manually to apply the changes.");
		return;
	}
	report("Configuration applied successfully. Rebooting the system to apply changes.");
}

function configureLDWS() {
	var playerPassword = sos.config.playerPassword;
	var dwsConfig;

	if (playerPassword === undefined || playerPassword === null || playerPassword === "") {
		// require() throws on a player whose firmware lacks the module
		try {
			var DeviceInfo = require("@brightsign/deviceinfo");
			var di = new DeviceInfo();
			playerPassword = di.serialNumber;
		} catch (e) {
			console.log("Error: " + JSON.stringify(e));
			report("Configuration failed: no password configured and the player serial number is unavailable ("
				+ errorText(e) + ")");
			return;
		}
	}

	// Never apply a DWS configuration without a password - it would lock the device out.
	if (!playerPassword) {
		report("Configuration failed: no password configured and the player serial number is empty.");
		return;
	}

	try {
		var DWSConfiguration = require("@brightsign/dwsconfiguration");
		dwsConfig = new DWSConfiguration();
	} catch (e) {
		console.log("Error: " + JSON.stringify(e));
		report("Configuration failed: the DWS configuration API is unavailable (" + errorText(e) + ")");
		return;
	}

	var config = {
		port: 80,                      // HTTP port for web interface
		password: {
			value: playerPassword,
			obfuscated: false          // Password stored as plain text
		},
		authenticationList: ["digest"] // Use digest HTTP authentication
	};

	watchdog = setTimeout(function () {
		console.log("DWS configuration did not settle within " + WATCHDOG_MS + "ms");
		report("Configuration failed: the DWS configuration did not settle within " + WATCHDOG_MS + "ms");
	}, WATCHDOG_MS);

	try {
		dwsConfig.applyConfig(config).then(
			function (result) {
				// restartRequired may be missing on some firmware - reboot unless explicitly not required
				if (result && result.restartRequired === false) {
					report("Configuration applied successfully. No reboot required.");
					return;
				}
				rebootAndReport();
			},
			function (error) {
				console.log("Error applying DWS configuration: " + JSON.stringify(error));
				report("Configuration failed: " + errorText(error));
			}
		);
	} catch (e) {
		console.log("Error: " + JSON.stringify(e));
		report("Configuration failed: " + errorText(e));
	}
}

configureLDWS();
