import react from "@vitejs/plugin-react";
import { Readable } from "node:stream";
import { defineConfig } from "vite";

const proxySessions = new Map();

export default defineConfig({
  base: "./",
  plugins: [react(), streamProxyPlugin()],
  build: {
    chunkSizeWarningLimit: 700
  }
});

function streamProxyPlugin() {
  return {
    name: "iptv-stream-proxy",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url, "http://localhost").pathname;
        if (pathname !== "/__stream_proxy" && pathname !== "/__api_proxy") {
          next();
          return;
        }

        if (request.method === "OPTIONS") {
          writeCorsHeaders(response);
          response.statusCode = 204;
          response.end();
          return;
        }

        try {
          const requestUrl = new URL(request.url, "http://localhost");
          const target = requestUrl.searchParams.get("url");
          const profile = requestUrl.searchParams.get("profile") || "browser";
          const session = requestUrl.searchParams.get("session") || `${profile}:${target}`;

          if (!target || !/^https?:\/\//i.test(target)) {
            response.statusCode = 400;
            response.end("Missing or invalid stream URL.");
            return;
          }

          await proxyStream(request, response, target, profile, session);
        } catch (error) {
          writeCorsHeaders(response);
          response.statusCode = 502;
          response.end(error instanceof Error ? error.message : "Stream proxy failed.");
        }
      });
    }
  };
}

async function proxyStream(request, response, target, profile, session) {
  const headers = getProxyHeaders(profile, target, session);

  if (request.headers.range) {
    headers.Range = request.headers.range;
  }

  const upstream = await fetch(target, { headers, redirect: "follow" });
  storeSessionCookies(session, upstream);
  logProxyResult(profile, target, upstream, headers);
  writeCorsHeaders(response);
  response.statusCode = upstream.status;

  const contentType = upstream.headers.get("content-type") || "";
  const isPlaylist =
    contentType.includes("mpegurl") ||
    contentType.includes("application/vnd.apple") ||
    new URL(target).pathname.toLowerCase().includes(".m3u8");

  if (!upstream.ok) {
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(`Provider returned HTTP ${upstream.status} for ${target}`);
    return;
  }

  if (isPlaylist) {
    const playlist = await upstream.text();
    response.setHeader("content-type", "application/vnd.apple.mpegurl; charset=utf-8");
    response.end(rewriteM3u8(playlist, target, profile, session));
    return;
  }

  copyHeader(upstream, response, "accept-ranges");
  copyHeader(upstream, response, "content-length");
  copyHeader(upstream, response, "content-range");
  response.setHeader("content-type", contentType || "application/octet-stream");

  if (!upstream.body) {
    response.end();
    return;
  }

  Readable.fromWeb(upstream.body).pipe(response);
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

function logProxyResult(profile, target, upstream, requestHeaders) {
  const targetUrl = new URL(target);
  const maskedUrl = `${targetUrl.protocol}//${targetUrl.host}${maskSensitivePath(targetUrl.pathname)}`;
  const cookieState = requestHeaders.Cookie ? "with-cookie" : "no-cookie";
  const contentType = upstream.headers.get("content-type") || "unknown";

  console.log(
    `[stream-proxy] ${upstream.status} profile=${profile} ${cookieState} type=${contentType} url=${maskedUrl}`
  );
}

function maskSensitivePath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  return parts
    .map((part, index) => {
      if (part.length > 18 || /^[a-f0-9]{16,}$/i.test(part)) {
        return `${part.slice(0, 4)}...${part.slice(-4)}`;
      }

      if (index > 1 && /\d/.test(part)) {
        return part.replace(/\d/g, "x");
      }

      return part;
    })
    .join("/")
    .replace(/^/, "/");
}

function writeCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET, HEAD, OPTIONS");
  response.setHeader("access-control-allow-headers", "Range, Content-Type, Accept");
  response.setHeader(
    "access-control-expose-headers",
    "Content-Length, Content-Range, Accept-Ranges, Content-Type"
  );
}

function copyHeader(upstream, response, name) {
  const value = upstream.headers.get(name);
  if (value) {
    response.setHeader(name, value);
  }
}
