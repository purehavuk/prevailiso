#!/bin/sh

# Start Auto-CPUFreq Service
# Auto-CPUFreq will not start corrctly without masking GNOME's power-profiles-daemon.
# https://github.com/AdnanHodzic/auto-cpufreq/issues/463
systemctl mask power-profiles-daemon.service
systemctl enable auto-cpufreq --now

