# bs-supervisor-proxy-set

Sets or disables the device HTTP proxy and its bypass list through the management API, and reports
the proxy state **before and after** the call.

Written to verify the supervisor proxy write path on BrightSign:

```
sos.management.proxy.setManual()
  -> hug.management.proxy_set_manual
  -> appletManagementProxyHandler
  -> BrightSignProxy.setManual()          (display-brightsign)
  -> @brightsign/hostconfiguration        applyConfig({ ...current, proxy, proxyBypassList })
```

The driver writes the host configuration directly through the JS API. Earlier builds routed the
write through `SupervisorInvocableBridge` as a `proxy.set_info` message, and variants 1/2 handled
that message in BrightScript via `roNetworkConfiguration.SetProxy`; neither hop exists any more.

## Why before/after instead of just calling it

Before the supervisor write path existed, `proxy.set_info` was only implemented in BrightScript.
In supervisor mode the bridge threw, `BrightSignProxy` caught the error and merely logged it, and the
call **resolved normally** — so the platform was told the proxy had been set while nothing was
written. A script that only calls `setManual()` and reports "ok" cannot tell the two apart.

Reading the state on both sides makes the outcome unambiguous. `verdict` is one of:

| verdict | meaning |
|---|---|
| `APPLIED — state changed as requested` | the write worked |
| `SILENT NO-OP — call succeeded but nothing changed` | the old broken behaviour |
| `FAILED LOUDLY, state unchanged — honest error` | not supported/failed, but reported truthfully |
| `FAILED LOUDLY BUT STATE CHANGED — inconsistent` | write partially applied then errored — investigate |

## Config

| name | required             | example                      |
|---|----------------------|------------------------------|
| `action` | yes                  | `enable` or `disable`        |
| `uri` | when `action=enable` | `192.168.1.22`               |
| `port` | when `action=enable` | `3128`                       |
| `username` | no                   | `sos`                        |
| `password` | no                   | `p@ss:w0rd$`                 |
| `bypassList` | no                   | `example.com,*.corp.example` |

Credentials are only included when **both** username and password are non-empty — that mirrors the
driver, which omits them otherwise.

`bypassList` is split on commas and passed through **unnormalized** on purpose. The driver trims each
entry and drops the empty ones, so a value like `" a.com , , b.com "` should come back from
`getBypassList()` as `["a.com","b.com"]` — if it doesn't, the normalization regressed.

`action=disable` clears the bypass list along with the proxy, so `after.bypassList` should be `[]`.

A password containing URL-special characters (`@`, `:`, `%`, `$`) is worth testing deliberately: the
driver percent-encodes credentials when storing the proxy URL and decodes them again when opening the
tunnel, so a mistake in that round trip shows up as a proxy authentication failure rather than as a
wrong value anywhere visible.

## Danger

`dangerLevel` is `high` on purpose. Pointing a device at an unreachable or wrong proxy costs you the
management connection to that device, and you then cannot send a follow-up script to undo it —
recovery needs DWS, the local network, or physical access. Verify the proxy is reachable **from the
device's network** before running with `action=enable`.

`action=disable` is the escape hatch, but only while the device is still reachable.

## Usage

```bash
sos custom-script upload
```

Then run it from the Box console or the API. On first upload a `uid` is added to `.sosconfig.json`;
bump `version` on later changes.
