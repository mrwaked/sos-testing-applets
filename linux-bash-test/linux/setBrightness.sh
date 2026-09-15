#!/usr/bin/env bash
# signageOS bash custom-script diagnostic — config delivery test

echo "=== signageOS bash custom-script diagnostic ==="
echo "interpreter : $(command -v bash || echo '!! bash NOT on PATH')"
echo "bash version: ${BASH_VERSION:-<not bash>}"
echo "user        : $(whoami)"
echo "cwd         : $(pwd)"
echo

echo "--- SOS_CONFIG_* env vars (config delivery) ---"
if env | grep -q '^SOS_CONFIG_'; then
    env | grep '^SOS_CONFIG_' | sort
else
    echo "!! NO SOS_CONFIG_* found -> preservEnvVars is not delivering config"
fi
echo

echo "expected: SOS_CONFIG_brightness = '${SOS_CONFIG_brightness:-<UNSET>}'"
echo "=== done ==="
exit 0
