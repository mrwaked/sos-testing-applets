# Proxy Setup Applet

Applet for setting up a manual proxy on a device using the signageOS JS API
([docs](https://docs.signageos.io/sdk/sos_management/proxy)).

On start it reports the current proxy state (`isEnabled`, `getConnectedTo`), sets the manual proxy
via `sos.management.proxy.setManual(uri, port, username?, password?)` and reports the state again.

## Configuration

| Name       | Mandatory | Description                   |
|------------|-----------|-------------------------------|
| `uri`      | yes       | Proxy server address          |
| `port`     | yes       | Proxy server port             |
| `username` | no        | Proxy authentication username |
| `password` | no        | Proxy authentication password |
