#!/usr/bin/bash
# BrightSign supervisor — bash custom script template
# Config values are exposed as SOS_CONFIG_<KEY> environment variables.

VALUE="$SOS_CONFIG_brightness"
echo "Received config value: $VALUE"
