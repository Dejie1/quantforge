# QuantForge

QuantForge is a keyboard-first quantitative interview practice app for mental
math, probability, sequences, estimation, and timed mock sessions. Questions,
answers, preferences, and progress stay in this browser's versioned local
storage. The app has no account, database, analytics service, cloud sync, or
network API.

Training scores are practice metrics only. They are not hiring predictions,
standardized percentiles, evidence of employer affiliation, or a substitute for
an employer's own assessment.

## Prerequisites

- Node.js 20 or newer
- npm
- Chromium installed for Playwright (`npx playwright install chromium`)

## Local development and verification

Install dependencies and start the Vite development server:

```sh
npm install
npm run dev
```

Run unit/component tests and the Chromium critical flows:

```sh
npm test
npm run test:e2e
```

Build and serve the production app locally:

```sh
npm run build
npm start
```

The production server listens on port `3000` by default, binds to `0.0.0.0`,
serves the SPA from `dist`, and accepts an optional valid `PORT` value. Its
health endpoint is `GET /health` and returns `{"status":"ok"}`.

## Railway deployment

Use these Railway service settings:

- Build command: `npm run build`
- Start command: `npm start`
- Healthcheck path: `/health`

Railway may provide `PORT`; no other environment variable is required. Do not
provision a database, account service, secret, volume, or external service for
QuantForge.
