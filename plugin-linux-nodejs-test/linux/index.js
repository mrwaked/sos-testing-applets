
var sosPlugin = {
	/**
	 * Required for settings, policy and bulk.
	 */
	set: function (data) {
		return new Promise(function (resolve, reject) {
			try {
				console.log('Setting background color to:', data.backgroundColor);
				window.parent.document.body.style.backgroundColor = data.backgroundColor;
				resolve();
			} catch (error) {
				reject(error);
			}
		});
	},
	/**
	 * Required for telemetry.
	 */
	get: function () {
		return new Promise(function (resolve, reject) {
			try {
				if (typeof document !== 'undefined' && document.body) {
					var currentBackgroundColor = window.parent.document.body.style.backgroundColor || 'white';

					resolve({
						backgroundColor: window.parent.document.body.style.backgroundColor,
					});
				} else {
					reject(new Error('Document or body element is not available'));
				}
			} catch (error) {
				reject(error);
			}
		});
	}
};

if (typeof window !== 'undefined') {
	window.sosPlugin = sosPlugin;
}