# Cloudflare Deploy

This project uses Cloudflare Workers + Static Assets:

- `dist/` serves the Vite frontend.
- `worker/index.js` handles `/__stream_proxy`.
- `wrangler.toml` tells Wrangler what to deploy.

## Option A: Cloudflare Pages

Use this if your app URL is like:

```text
https://your-project.pages.dev
```

Use these settings in Pages:

```text
Install command: npm ci
Build command: npm run build
Build output directory: dist
```

Leave the deploy command empty. Cloudflare Pages will build the frontend from `dist` and load
the functions from:

```text
functions/__api_proxy.js
functions/__stream_proxy.js
```

## Option B: Cloudflare Workers Static Assets

Use this if you want to deploy with Wrangler and `wrangler.toml`:

```text
Build command: npm run deploy:cloudflare
```

This deploys:

```text
worker/index.js
dist/
```

## Local Commands

```bash
npm run build
npx wrangler deploy
```

## Notes

Do not set `vite.config.js` as a Worker entrypoint. Wrangler should read `wrangler.toml`, where
`main` is:

```text
worker/index.js
```
