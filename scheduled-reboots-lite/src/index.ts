import {WeekdayType} from "@signageos/front-applet/es6/FrontApplet/Management/Power/IPower";

require('./index.css');

import sos from '@signageos/front-applet';

// Wait on sos data are ready (https://docs.signageos.io/api/js/content/latest/js-applet-basics#onready)
sos.onReady().then(async function () {
	const contentElement = document.getElementById('root');
	console.log('sOS is ready');
	const activeReboots = await sos.management.power.getScheduledReboots();
	if (activeReboots.length > 0) {
		contentElement.innerHTML = '<h2>Active scheduled reboots:</h2>';
		activeReboots.forEach((reboot) => {
			contentElement.innerHTML += `<p>${reboot.rule.weekdays.join(', ')} at ${reboot.rule.time}</p>`;
		});
		contentElement.innerHTML += '<p>Please remove scheduled reboots in Box and do applet refresh to set new!</p>';
	} else {
		contentElement.innerHTML = '<h2>Setting new scheduled reboots...</h2>';
		const today = getTodayAsString();
		const timeIn10Minutes = getTimeIn10Minutes();
		console.log(`Today is ${today}, time in 5 minutes is ${timeIn10Minutes}`);
		await sos.management.power.setScheduledReboot([today], timeIn10Minutes);
		contentElement.innerHTML = `<p>Added scheduled reboot in 5 minutes - ${today} in ${timeIn10Minutes}</p>`;
		for (let i = 0; i < 1; i++) {
			const randomDay = generateRandomDayInWeek();
			const randomTime = generateRandomTime();
			console.log(`Setting scheduled reboot for ${randomDay} at ${randomTime}`);
			contentElement.innerHTML += `<p>Setting scheduled reboot for ${randomDay} at ${randomTime}</p>`;
			await sos.management.power.setScheduledReboot([randomDay], randomTime);
		}
		contentElement.innerHTML += '<p>Reboots are set, check Box on Settings page! WAIT A FEW MINUTES FOR TELEMETRY!</p>';
	}
});

function generateRandomDayInWeek(): WeekdayType {
	const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
	const randomIndex = Math.floor(Math.random() * days.length);
	return days[randomIndex] as WeekdayType;
}

function generateRandomTime(): string {
	let hours = Math.floor(Math.random() * 24);
	const minutes = Math.floor(Math.random() * 60);
	return `${hours < 10 ? `0${hours}` : hours}:${minutes < 10 ? `0${minutes}` : `${minutes}`}:00`;
}

function getTodayAsString(): WeekdayType {
	const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
	const date = new Date();
	return days[date.getDay()] as WeekdayType;
}

function getTimeIn10Minutes(): string {
	const date = new Date();
	date.setMinutes(date.getMinutes() + 5);
	const hours = date.getHours();
	const minutes = date.getMinutes();
	return `${hours < 10 ? `0${hours}` : hours}:${minutes < 10 ? `0${minutes}` : `${minutes}`}:00`;
}