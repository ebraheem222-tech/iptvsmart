# IPTV Smart Player

Free IPTV player MVP for users who already have a legal IPTV subscription.

The app does not ship channels, playlists, or provider accounts. It accepts either:

- Xtream Codes credentials: server URL, username, password
- M3U playlist URL

## Run locally

```bash
npm install
npm run dev
```

## Current MVP

- Xtream login and account validation
- Xtream live, VOD, and series category loading
- M3U playlist parsing
- Channel/movie/series grid
- Series episode loading
- Favorites saved locally
- TV remote friendly focus navigation
- HTML5/HLS playback for the shared web core

## Browser playback note

Live Xtream channels are opened as HLS `.m3u8` first because browsers usually cannot play raw
MPEG-TS `.ts` live streams directly. If a provider blocks browser CORS access, playback can still
fail in Chrome even when the same subscription works in native TV/player apps.

## Later TV packaging

- Samsung Tizen wrapper/package
- LG webOS wrapper/package

## LG webOS package

```bash
npm run package:webos
```

The generated IPK is written to:

```text
platforms/webos/out
```
- Platform-specific player adapters where native playback is required
