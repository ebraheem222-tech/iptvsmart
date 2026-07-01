# LG Content Store Submission

## Build

```bash
npm run package:webos
```

Generated IPK:

```text
platforms/webos/out/com.iptvsmart.app.player_0.1.0_all.ipk
```

## Test on LG TV

Install LG webOS CLI:

```bash
npm install -g @webos-tools/cli
```

Add your TV as a target device:

```bash
ares-setup-device
```

Install the IPK:

```bash
ares-install --device myTV platforms/webos/out/com.iptvsmart.app.player_0.1.0_all.ipk
```

Launch the app:

```bash
ares-launch --device myTV com.iptvsmart.app.player
```

Open Web Inspector while the app is running:

```bash
ares-inspect --device myTV --app com.iptvsmart.app.player --open
```

## Store Listing Draft

Title:

```text
IPTV Smart Player
```

Short description:

```text
Free IPTV player for users with their own subscriptions.
```

Full description:

```text
IPTV Smart Player lets users watch content from their own IPTV provider subscription.
The app supports Xtream Codes credentials and M3U playlist URLs.

This app does not provide, sell, host, or include any channels, movies, series,
playlists, or subscriptions. Users must use their own legally obtained IPTV
provider account.
```

## Submission Notes

- Keep the app ID stable. After publishing, do not change `com.iptvsmart.app.player`.
- Increase `version` in `platforms/webos/appinfo.json` before every store update.
- Prepare store images required by LG Seller Lounge separately. The package icons are not enough.
- Prepare the LG UX scenario and self-checklist before submission.
- Test with legal provider accounts only, including failed login, expired subscription, live playback, VOD playback, series episodes, search, favorites, and remote Back/OK/arrow behavior.
