# LG webOS Packaging

This folder contains the webOS TV packaging metadata for IPTV Smart Player.

Generated package source:

```bash
npm run build:webos
```

Package as IPK after installing LG webOS CLI:

```bash
npm install -g @webos-tools/cli
npm run package:webos
```

The generated webOS app root is:

```text
platforms/webos/app
```

The IPK output folder is:

```text
platforms/webos/out
```

LG Content Store submission must be done from LG Seller Lounge with the IPK, store images,
UX scenario, and self-checklist.
