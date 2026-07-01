# Cloudflare Deploy

This project uses Cloudflare Workers + Static Assets:

- `dist/` serves the Vite frontend.
- `worker/index.js` handles `/__stream_proxy`.
- `wrangler.toml` tells Wrangler what to deploy.

## Cloudflare Build Settings

Use these settings:

```text
Install command: npm ci
Build command: npm run build
Deploy command: npx wrangler deploy
Build output directory: dist
```

If you use Cloudflare Pages without Workers, leave the deploy command empty and set output to
`dist`, but `/__stream_proxy` will not work.

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
