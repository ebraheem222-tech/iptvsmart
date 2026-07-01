const proxySessions = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/__stream_proxy") {
      return handleStreamProxy(request);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleStreamProxy(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  try {
    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get("url");
    const profile = requestUrl.searchParams.get("profile") || "browser";
    const session = requestUrl.searchParams.get("session") || `${profile}:${target}`;

    if (!target || !/^https?:\/\//i.test(target)) {
      return textResponse("Missing or invalid stream URL.", 400);
    }

    return proxyStream(request, target, profile, session);
  } catch (error) {
    return textResponse(error instanceof Error ? error.message : "Stream proxy failed.", 502);
  }
}

async function proxyStream(request, target, profile, session) {
  const headers = getProxyHeaders(profile, target, session);

  if (request.headers.get("range")) {
    headers.Range = request.headers.get("range");
  }

  const upstream = await fetch(target, {
    headers,
    redirect: "follow"
  });

  storeSessionCookies(session, upstream);

  const contentType = upstream.headers.get("content-type") || "";
  const isPlaylist =
    contentType.includes("mpegurl") ||
    contentType.includes("application/vnd.apple") ||
    new URL(target).pathname.toLowerCase().includes(".m3u8") ||
    new URL(target).pathname.toLowerCase().includes(".mxu");

  if (!upstream.ok) {
    return textResponse(`Provider returned HTTP ${upstream.status}.`, upstream.status);
  }

  if (isPlaylist) {
    const playlist = await upstream.text();
    const headers = corsHeaders({
      "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
      "cache-control": "no-store"
    });
    return new Response(rewriteM3u8(playlist, target, profile, session), {
      status: upstream.status,
      headers
    });
  }

  const responseHeaders = corsHeaders({
    "content-type": contentType || "application/octet-stream",
    "cache-control": "no-store"
  });

  copyHeader(upstream, responseHeaders, "accept-ranges");
  copyHeader(upstream, responseHeaders, "content-length");
  copyHeader(upstream, responseHeaders, "content-range");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  });
}

function rewriteM3u8(playlist, baseUrl, profile, session) {
  return playlist
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (trimmed.startsWith("#")) {
        return line.replace(
          /URI="([^"]+)"/g,
          (_, uri) => `URI="${proxyUrl(resolveUrl(uri, baseUrl), profile, session)}"`
        );
      }

      return proxyUrl(resolveUrl(trimmed, baseUrl), profile, session);
    })
    .join("\n");
}

function resolveUrl(value, baseUrl) {
  return new URL(value, baseUrl).toString();
}

function proxyUrl(target, profile, session) {
  return `/__stream_proxy?profile=${encodeURIComponent(profile)}&session=${encodeURIComponent(
    session
  )}&url=${encodeURIComponent(target)}`;
}

function getProxyHeaders(profile, target, session) {
  const targetUrl = new URL(target);
  const headers = {
    Accept: "*/*",
    Connection: "keep-alive",
    Referer: `${targetUrl.protocol}//${targetUrl.host}/`
  };

  const cookies = proxySessions.get(session);
  if (cookies?.length) {
    headers.Cookie = cookies.join("; ");
  }

  if (profile === "vlc") {
    headers["User-Agent"] = "VLC/3.0.20 LibVLC/3.0.20";
    return headers;
  }

  if (profile === "smarttv") {
    headers["User-Agent"] =
      "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79 Safari/537.36 WebAppManager";
    return headers;
  }

  headers["User-Agent"] =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
  return headers;
}

function storeSessionCookies(session, upstream) {
  const setCookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : splitSetCookieHeader(upstream.headers.get("set-cookie"));

  if (!setCookies.length) {
    return;
  }

  const current = proxySessions.get(session) || [];
  const next = new Map(current.map((cookie) => [cookie.split("=")[0], cookie]));

  for (const setCookie of setCookies) {
    const cookie = setCookie.split(";")[0]?.trim();
    if (cookie) {
      next.set(cookie.split("=")[0], cookie);
    }
  }

  proxySessions.set(session, [...next.values()]);
}

function splitSetCookieHeader(value) {
  if (!value) {
    return [];
  }

  return value.split(/,(?=\s*[^;,\s]+=)/g);
}

function corsHeaders(extra = {}) {
  return new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "Range, Content-Type, Accept",
    "access-control-expose-headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
    ...extra
  });
}

function copyHeader(upstream, responseHeaders, name) {
  const value = upstream.headers.get(name);
  if (value) {
    responseHeaders.set(name, value);
  }
}

function textResponse(message, status) {
  return new Response(message, {
    status,
    headers: corsHeaders({
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store"
    })
  });
}
