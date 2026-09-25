// Decorative DOM effects: confetti burst for records, star field for the night mood.

interface Particle {
	el: HTMLElement;
	x: number;
	y: number;
	vx: number;
	vy: number;
	rot: number;
	vr: number;
}

const CONFETTI_COLORS = ['#ff4fa8', '#ffb6dc', '#ffffff', '#ff8ac6'];
const CONFETTI_DURATION_MS = 2200;
const GRAVITY = 0.35;

export function burstConfetti(layer: HTMLElement, originX: number, originY: number, count: number): void {
	const particles: Particle[] = [];
	for (let i = 0; i < count; i++) {
		const el = document.createElement('span');
		el.className = 'confetti';
		const size = 8 + Math.random() * 10;
		el.style.width = size + 'px';
		el.style.height = size * (0.5 + Math.random()) + 'px';
		el.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] || '#ff4fa8';
		layer.appendChild(el);
		const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
		const speed = 9 + Math.random() * 13;
		particles.push({
			el,
			x: originX,
			y: originY,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			rot: Math.random() * 360,
			vr: (Math.random() - 0.5) * 24,
		});
	}
	const start = Date.now();
	const frame = () => {
		const t = (Date.now() - start) / CONFETTI_DURATION_MS;
		for (const p of particles) {
			p.x += p.vx;
			p.y += p.vy;
			p.vy += GRAVITY;
			p.vx *= 0.99;
			p.rot += p.vr;
			p.el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) rotate(' + p.rot + 'deg)';
			p.el.style.opacity = String(Math.max(0, 1 - t * t));
		}
		if (t < 1) {
			requestAnimationFrame(frame);
		} else {
			for (const p of particles) {
				layer.removeChild(p.el);
			}
		}
	};
	requestAnimationFrame(frame);
}

export function buildStars(field: HTMLElement, count: number): void {
	for (let i = 0; i < count; i++) {
		const star = document.createElement('span');
		star.className = 'star';
		const size = 2 + Math.random() * 4;
		star.style.left = Math.random() * 100 + '%';
		star.style.top = Math.random() * 100 + '%';
		star.style.width = size + 'px';
		star.style.height = size + 'px';
		star.style.animationDuration = 2 + Math.random() * 4 + 's';
		star.style.animationDelay = -Math.random() * 6 + 's';
		field.appendChild(star);
	}
}
