# Sabinovka Applet

Joke signage applet answering the only question that matters: how many samců are v kině right now.
The number is scraped from the public chat on https://www.artlove.cz/aktualne-v-klubu/, where the club
operator posts headcounts during the day ("v kině již 10 samců").

## How it works

The chat is WordPress plugin Wise Chat Pro. Its messages endpoint needs an HttpOnly cookie and sends no CORS
headers, so the applet cannot call it directly. A tiny Cloudflare Worker in `relay/` does the login and the
applet only polls the worker:

1. Worker fetches the club page and extracts the static chat `checksum`.
2. Worker calls `wise_chat_maintenance_endpoint` and captures the `wc_auth_*` cookie (valid ~14 days).
3. Worker calls `wise_chat_messages_endpoint` with the cookie and returns `{ nowTime, fetchedAt, messages: [{ id, time, text }] }`
   newest-first, cached for 5 min in a KV namespace shared by all worker instances, with `Access-Control-Allow-Origin: *`.
4. Applet parses the texts (`src/parser.ts`): the count is the integer directly before a samec-word
   (samec / samci / samců), other numbers such as prices or dates are ignored, "končíme" or "zavřeno" means closed,
   "otevřen" means open with zero, and a samci mention without a number keeps the last count as `N+`.
5. Applet draws a faint step chart of the reported counts (`src/chart.ts`) behind the number, right-anchored
   at "now"; closing and opening notes plot as zero and the chart fades in again whenever a value changes.
6. While the cinema is open, the newest chat message of the current day is shown under "v kině" as time + text,
   emoticon tags stripped and truncated to 90 characters.
7. Above the number: a trend pill (arrow + delta against the previous report) and a slečny pill when the latest
   report mentions girls. Every change pulses the number for 15 s; a new daily record of at least 5 adds 15 s of
   confetti bursts, a "Nový rekord dne" label and the bundled gong sound (`src/gong.mp3`, emitted as `dist/gong.mp3`).
8. Closed or stale: star field and moon, "Sabinovka spí · otevírá od HH:MM" (opening time parsed from messages
   such as "od 12 hodin"), footer with elapsed time ("zavřeli před 2 h · 21:23").

## Configuration

| Key              | Mandatory | Description                                                         |
| ---------------- | --------- | ------------------------------------------------------------------- |
| `relayUrl`       | yes       | Base URL of the deployed Cloudflare Worker relay (see `relay/`).    |
| `refreshSeconds` | no        | Polling interval in seconds. Default 60, minimum 15.                |
| `staleHours`     | no        | Hours without a report after which the cinema shows as closed. Default 4. |

## Display states

| State          | Headline      | Footer                          |
| -------------- | ------------- | ------------------------------- |
| open           | `10 samců`    | poslední hlášení před 12 min · HH:MM |
| open, approx   | `15+ samců`   | poslední hlášení před 12 min · HH:MM |
| open, unknown  | `? samců`     | poslední hlášení před 12 min · HH:MM |
| closed         | `0 samců`     | zavřeli před 2 h · HH:MM        |
| stale          | `0 samců`     | bez hlášení už 4 h · poslední HH:MM |
| relay offline  | last value    | … · relay offline               |

## Relay deployment

```sh
npx wrangler@4 login                      # once
npm run relay:dev                         # local worker on http://localhost:8787
npm run relay:deploy                      # prints the workers.dev URL
curl -s "$RELAY/health" | jq              # upstream statuses, cookie age, last error
curl -s "$RELAY/?raw=1" | jq '.result|length'   # untrimmed upstream body (fixture refresh)
```

## Development

`sos.config.local.json` points `relayUrl` at `http://localhost:8787`, which is where `npm run relay:dev` serves the
worker locally. Replace it with the deployed `workers.dev` URL once the relay is deployed.

```sh
npm test          # parser unit tests against test/fixtures/messages.sample.json
npm start         # local emulator on http://localhost:8090, relayUrl taken from sos.config.local.json
npm run build     # type-check, bundle to dist/, es-check ES5
npm run upload    # sos applet upload
```
