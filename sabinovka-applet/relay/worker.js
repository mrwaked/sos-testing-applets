// Cloudflare Worker relaying the artlove.cz Wise Chat channel as trimmed JSON with CORS.
// Flow: page -> checksum, maintenance -> wc_auth cookie, messages -> { nowTime, fetchedAt, messages[] }.

const COOKIE_MAX_AGE_MS = 13 * 24 * 3600e3;
const KV_KEY = 'trimmed';
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const UPSTREAM_HEADERS = {
	'X-Requested-With': 'XMLHttpRequest',
	'User-Agent': USER_AGENT,
	Accept: 'application/json, text/javascript, */*; q=0.01',
	Referer: 'https://www.artlove.cz/aktualne-v-klubu/',
};

// Isolate-lifetime state; a cold start re-authenticates, the message cache also lives in KV.
const state = {
	checksum: null,
	cookie: null,
	cookieAt: 0,
	cache: null,
	cacheAt: 0,
	lastUpstream: {},
	lastError: null,
};

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: corsHeaders() });
		}
		if (request.method !== 'GET') {
			return json({ error: 'method not allowed' }, 405, 0);
		}
		const ttlMs = Number(env.CACHE_TTL_SECONDS || 30) * 1000;

		if (url.pathname === '/health') {
			try {
				await getTrimmed(env, ttlMs);
			} catch (e) {
				state.lastError = errorMessage(e);
			}
			return json(health(), state.lastError ? 502 : 200, 0);
		}

		try {
			if (url.searchParams.get('raw') === '1') {
				return json(await fetchMessagesWithRetry(env), 200, 0);
			}
			return json(await getTrimmed(env, ttlMs), 200, ttlMs);
		} catch (e) {
			state.lastError = errorMessage(e);
			return json({ error: state.lastError }, 502, 0);
		}
	},
};

// Memory first, then the KV namespace shared by all isolates, then upstream.
async function getTrimmed(env, ttlMs) {
	if (state.cache && Date.now() - state.cacheAt < ttlMs) {
		return state.cache;
	}
	const stored = await env.CACHE.get(KV_KEY, 'json');
	if (stored && Date.now() - stored.cachedAt < ttlMs) {
		state.cache = stored.body;
		state.cacheAt = stored.cachedAt;
		return state.cache;
	}
	const upstream = await fetchMessagesWithRetry(env);
	state.cache = trim(upstream);
	state.cacheAt = Date.now();
	state.lastError = null;
	await env.CACHE.put(KV_KEY, JSON.stringify({ cachedAt: state.cacheAt, body: state.cache }), {
		expirationTtl: Math.max(60, Math.ceil(ttlMs / 1000)),
	});
	return state.cache;
}

// Failure ladder: plain -> new cookie -> new checksum + new cookie -> give up.
async function fetchMessagesWithRetry(env) {
	await ensureAuth(env);
	let data = await fetchMessages(env);
	if (data) return data;

	state.cookie = null;
	await ensureAuth(env);
	data = await fetchMessages(env);
	if (data) return data;

	state.checksum = null;
	state.cookie = null;
	await ensureAuth(env);
	data = await fetchMessages(env);
	if (data) return data;

	throw new Error('messages endpoint kept failing after re-auth (last status ' + state.lastUpstream.messages + ')');
}

async function ensureAuth(env) {
	if (!state.checksum) {
		const res = await fetch(env.PAGE_URL, {
			headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
		});
		state.lastUpstream.page = res.status;
		const html = await res.text();
		const match =
			/&quot;checksum&quot;:&quot;([A-Za-z0-9+\/=]+)&quot;/.exec(html) ||
			/"checksum":"([A-Za-z0-9+\/=]+)"/.exec(html);
		if (!match) {
			throw new Error('checksum not found in page (status ' + res.status + ')');
		}
		state.checksum = match[1];
	}

	if (!state.cookie || Date.now() - state.cookieAt > COOKIE_MAX_AGE_MS) {
		const res = await fetch(
			ajaxUrl(env, {
				action: 'wise_chat_maintenance_endpoint',
				full: 'true',
				'channelIds[]': env.CHANNEL_ID,
				checksum: state.checksum,
			}),
			{ headers: UPSTREAM_HEADERS },
		);
		state.lastUpstream.maintenance = res.status;
		const cookie = extractAuthCookie(res.headers);
		if (!cookie) {
			throw new Error('no wc_auth cookie from maintenance endpoint (status ' + res.status + ')');
		}
		state.cookie = cookie;
		state.cookieAt = Date.now();
	}
}

async function fetchMessages(env) {
	const res = await fetch(
		ajaxUrl(env, {
			action: 'wise_chat_messages_endpoint',
			'channelIds[]': env.CHANNEL_ID,
			lastId: '0',
			fromActionId: '0',
			lastCheckTime: '',
			checksum: state.checksum,
			init: '1',
		}),
		{ headers: Object.assign({}, UPSTREAM_HEADERS, { Cookie: state.cookie }) },
	);
	state.lastUpstream.messages = res.status;
	if (!res.ok) return null;
	let data;
	try {
		data = await res.json();
	} catch (e) {
		return null;
	}
	return data && Array.isArray(data.result) ? data : null;
}

function extractAuthCookie(headers) {
	const list =
		typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') || ''];
	for (const raw of list) {
		const match = /(wc_auth_[A-Za-z0-9]+=[^;]+)/.exec(raw);
		if (match) return match[1];
	}
	return null;
}

function trim(data) {
	const messages = data.result.map((m) => ({ id: m.id, time: m.timeUTC, text: m.text }));
	messages.reverse();
	return { nowTime: data.nowTime, fetchedAt: new Date().toISOString(), messages };
}

function health() {
	const now = Date.now();
	return {
		ok: !state.lastError,
		hasChecksum: !!state.checksum,
		hasCookie: !!state.cookie,
		cookieAgeSec: state.cookie ? Math.round((now - state.cookieAt) / 1000) : null,
		cacheAgeSec: state.cache ? Math.round((now - state.cacheAt) / 1000) : null,
		lastUpstream: state.lastUpstream,
		lastError: state.lastError,
	};
}

function ajaxUrl(env, params) {
	const url = new URL(env.AJAX_URL);
	for (const key in params) {
		url.searchParams.set(key, params[key]);
	}
	return url.toString();
}

function corsHeaders() {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};
}

function json(body, status, ttlMs) {
	const headers = corsHeaders();
	headers['Content-Type'] = 'application/json; charset=utf-8';
	headers['Cache-Control'] = ttlMs > 0 ? 'public, max-age=' + Math.floor(ttlMs / 1000) : 'no-store';
	return new Response(JSON.stringify(body), { status, headers });
}

function errorMessage(e) {
	return e && e.message ? String(e.message) : String(e);
}
