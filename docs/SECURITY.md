# Security policy

## Reporting a vulnerability

Please report security problems privately, using GitHub's **private vulnerability reporting** (the "Security" tab of
the repository, then "Report a vulnerability").

If that is not available to you, open an ordinary issue that says you have a security problem **without any
details** (no exploit steps, no secrets), and the maintainer will arrange a private channel.

This is a hobby project maintained in spare time, so replies may take a while.

## Supported use

Health Animal is meant for personal use: on your own phone, or on a server you run on your own private network
or VPN. It is not designed to be exposed to the public internet. See the Security section of the
[README](../README.md) for the security model and the settings that control it (`REQUIRE_PASSWORD`, `HOST`,
`CORS_ORIGINS`, `ALLOW_REGISTER`).

Never publish an APK built with your own `APP_KEY` or server address: both are embedded in it.
