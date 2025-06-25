const os = require('os');

console.log('Starting CPU and Memory Monitoring Test...');
console.log(`Monitoring started at ${new Date().toISOString()}\n`);

function startMonitoring() {
	const cpuUsage = randomCpuUsage();
	const memoryUsage = randomMemoryUsage();
	console.log(`\n${JSON.stringify(cpuUsage)}\n${JSON.stringify(memoryUsage)}`);
}

let currentUserUsage = 10;
let currentSystemUsage = 5;

function randomCpuUsage() {
	const cpuCount = os.cpus().length;
	// Maximální změna v jednom kroku
	const maxStep = randomNumber(5, 35);

	// Vypočítat nové hodnoty s omezeným krokem
	let user = currentUserUsage + (Math.random() * 2 - 1) * maxStep;
	let system = currentSystemUsage + (Math.random() * 2 - 1) * maxStep;

	// Omezit hodnoty na rozmezí 0-100
	user = Math.max(0, Math.min(100, user));
	system = Math.max(0, Math.min(100 - user, system));
	const idle = 100 - (user + system);

	currentUserUsage = user;
	currentSystemUsage = system;

	return {
		user: user.toFixed(2),
		system: system.toFixed(2),
		idle: idle.toFixed(2),
		cpuCount: cpuCount
	};
}

function randomMemoryUsage() {
	const totalMemory = os.totalmem();
	const freeMemory = os.freemem();
	const usedMemory = totalMemory - freeMemory;
	const memoryUsage = (usedMemory / totalMemory) * 100;

	return {
		total: (totalMemory / (1024 * 1024)).toFixed(2) + ' MB',
		free: (freeMemory / (1024 * 1024)).toFixed(2) + ' MB',
		used: (usedMemory / (1024 * 1024)).toFixed(2) + ' MB',
		usagePercentage: memoryUsage.toFixed(2) + '%'
	};
}

function randomNumber(min, max) {
	return Math.random() * (max - min) + min;
}
// -----
let previousCpuUsageTelemetry = 0;
let telemetryIntervalId = null;
let currentReportInterval = 60000; // výchozí 10s

function telemetryMonitoring() {
	if (telemetryIntervalId) {
		clearInterval(telemetryIntervalId);
	}
	telemetryIntervalId = setInterval(checkTelemetry, currentReportInterval);
}

function checkTelemetry() {
	startMonitoring();
	console.log('Calculating telemetry...');
	if (currentUserUsage > previousCpuUsageTelemetry + 10) {
		console.log(`Telemetry: CPU usage increased significantly to ${currentUserUsage.toFixed(2)}% from ${previousCpuUsageTelemetry.toFixed(2)}%`);
		previousCpuUsageTelemetry = currentUserUsage;
		setReportInterval(10_000); // zrychlit na 10s
	} else if (currentUserUsage > previousCpuUsageTelemetry + 5) {
		console.log('Telemetry: CPU no major change detected');
		previousCpuUsageTelemetry = currentUserUsage;
		setReportInterval(60_000);
	} else if (currentReportInterval < 60_000) {
		// postupně prodlužovat interval: 10s -> 30s -> 60s
		console.log(`Telemetry: CPU usage stable at ${currentUserUsage.toFixed(2)}%`);
		if (currentReportInterval < 10000) setReportInterval(10000);
		else if (currentReportInterval < 30000) setReportInterval(30000);
		else setReportInterval(60000);
	} else {
		console.log('Telemetry: CPU usage stable, no significant changes detected');
		setReportInterval(60_000);
	}
}

function setReportInterval(newInterval) {
	if (currentReportInterval !== newInterval) {
		console.log('Setting new telemetry report interval:', newInterval, 'ms');
		currentReportInterval = newInterval;
		telemetryMonitoring(); // restartovat interval s novou hodnotou
	}
}


telemetryMonitoring();