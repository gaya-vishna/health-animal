# Health Animal

A whimsical, anti-shame **sloth Tamagotchi copilot** for tracking calories, water and sleep, whether you are
losing, gaining or maintaining weight. Your sloth reacts to how your day goes; there is no guilt, only gentle nudges.

> Not medical or nutritional advice. This is a playful tracker; it does not replace a doctor, registered dietitian or nutritionist. See [Disclaimer](#disclaimer).

## Features

- Meal logging with AI calorie estimates (text and photo), with an offline estimator as a fallback
- Daily calorie range, water and sleep tracking
- A sloth mascot whose mood follows your day
- Goals for losing, gaining or maintaining weight, with a fuel planner
- Weigh-ins and progress history
- "Rescue" suggestions: surprise dishes that fit what is left (or still to eat) today
- Saved recipes, reminders, English and Hebrew (RTL)
- Android app that keeps all data on the phone

## Architecture

- **Web + server mode**: React/Vite client served by an Express + Prisma (SQLite) server. Accounts live on the server.
- **Phone-local mode**: the Android app (Capacitor) bundles the same client. `client/src/local/` answers every
  `/api/...` call from on-phone storage, so no server or login is needed. Only the AI question can leave the phone.
- Shared AI prompts live in `shared/aiPrompts.mjs`, used by both the server and the phone.

## Run your own server

There is **no public server**: everyone self-hosts.

### Environment

Copy `server/.env.example` to `server/.env` (for Docker, to `./.env` in the project root) and set at least
`GEMINI_API_KEY` and `JWT_SECRET`. Other options: `APP_KEY`, `GEMINI_MODEL`, `ALLOW_REGISTER`, `TRUST_PROXY`,
`PORT`, `DATABASE_URL`. See the comments in the file.

### Development

```bash
npm run install:all
npm run db:push     # create the SQLite database
npm run dev         # server + client together
```

### Docker

```bash
cp server/.env.example .env     # then edit it
docker compose up -d --build
```

The app listens on port 8090 by default and stores data in the `health_data` volume. Bind it to your LAN/VPN or
to `127.0.0.1` behind a reverse proxy, never straight to the public internet.

## Android

Build your own APK; see [mobile/README.md](mobile/README.md). AI options in the app:

1. **Your own Gemini key**, pasted in Settings (no server at all).
2. **Your own server**, via `VITE_AI_SERVERS` + `VITE_APP_KEY` at build time.
3. **Neither**: offline estimates.

## Security and privacy

- On the phone, your data stays on the phone.
- With your own key, food text and photos go straight to Google Gemini. With a server, they go to your server and then to Gemini.
- APKs embed `APP_KEY`, so never publish an APK built with your key or server address.
- Web login is passwordless (the name is the login). Run it only on a trusted network or VPN, and set
  `ALLOW_REGISTER=false` once your accounts exist.
- Not medical advice (see [Disclaimer](#disclaimer)).

## Contributing

- Every `t()` string needs a Hebrew translation: run `npm run check:i18n` in `client`.
- Keep `client/src/local/localApi.js` in sync with the server routes.
- The AI prompts live in `shared/aiPrompts.mjs`.
- By submitting a contribution you grant the author the right to use it, including commercially, and to relicense it.

## Disclaimer

- Health Animal is not medical or nutritional advice.
- It does not replace a doctor, registered dietitian or nutritionist.
- AI and offline calorie estimates can be wrong.
- Talk to a professional before making big changes, if you are pregnant, or if you have a medical condition.

If food or weight feels heavy right now, please reach out to a professional or an eating-disorder support line. You deserve support 🍃

## License

Health Animal is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE).

- Free for personal and non-commercial use.
- Any commercial use (selling, ads, paid services, use in a company's product) needs written permission from the author.
- The names and artwork are reserved; see [NOTICE](NOTICE).
