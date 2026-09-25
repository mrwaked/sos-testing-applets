# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Relay caches messages in Cloudflare KV for 5 min (was 30 s in memory) so artlove.cz is fetched at most once per 5 minutes

## [1.4.2] - 2026-09-22

### Changed
- Replaced gong.mp3 with a new recording

## [1.4.1] - 2026-09-22

### Changed
- Number-change effects last 15 s: glow pulse on every change, repeated confetti and label on records

## [1.4.0] - 2026-09-22

### Added
- Gong sound (bundled gong.mp3) played with the daily record fanfare

## [1.3.0] - 2026-09-22

### Added
- Trend pill with arrow and delta against the previous report
- Confetti, glow burst and "Nový rekord dne" label when the count climbs to a new daily record of at least 5
- Night mood when closed: stars, moon and "Sabinovka spí · otevírá od HH:MM" parsed from the chat
- Slečny pill when the latest report mentions girls, with their count when given
- Footer shows elapsed time ("před 12 min") next to the report time
- `staleHours` applet config for the no-report threshold (default 4)

## [1.2.0] - 2026-09-22

### Added
- Newest chat message of the current day shown under "v kině" while the cinema is open

## [1.1.0] - 2026-09-16

### Added
- Background step chart of the samců count history behind the number, refreshed when a reported value changes

## [1.0.0] - 2026-09-16

### Added
- Sabinovka applet showing the number of samců v kině scraped from the club chat via a Cloudflare Worker relay
