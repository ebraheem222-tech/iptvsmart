import { Maximize2, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export default function Player({ item, sources = [], onClose }) {
  const videoRef = useRef(null);
  const [playbackError, setPlaybackError] = useState("");
  const [sourceIndex, setSourceIndex] = useState(0);
  const [needsUserPlay, setNeedsUserPlay] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const playbackSources = useMemo(() => expandDevProxySources(sources), [sources]);
  const activeSourceConfig = playbackSources[sourceIndex];
  const activeSource = activeSourceConfig?.url || "";
  const activeSourceLabel = activeSourceConfig?.label || "stream";
  const canTryNextSource = sourceIndex < playbackSources.length - 1;

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeSource) {
      return undefined;
    }

    console.info("[IPTV playback] trying", activeSourceLabel, maskPlaybackUrl(activeSource));
    setPlaybackError("");
    setNeedsUserPlay(false);
    setIsLoading(true);
    let hls;
    let mpegtsPlayer;
    let disposed = false;
    let failed = false;
    const startupTimer = window.setTimeout(() => {
      if (!disposed && video.readyState < 2) {
        fail(getStartupTimeoutMessage(activeSource, activeSourceLabel));
      }
    }, 9000);

    function clearStartupTimer() {
      window.clearTimeout(startupTimer);
    }

    video.addEventListener("playing", clearStartupTimer);
    video.addEventListener("canplay", clearStartupTimer);

    function fail(message) {
      if (disposed || failed) {
        return;
      }

      clearStartupTimer();
      failed = true;

      if (canTryNextSource) {
        setPlaybackError(`${message} Trying another playback route...`);
        setTimeout(() => setSourceIndex((current) => current + 1), 350);
        return;
      }

      setIsLoading(false);
      setPlaybackError(getFinalPlaybackMessage(message));
    }

    async function setupPlayback() {
      const supportsNativeHls = video.canPlayType("application/vnd.apple.mpegurl");

      if (isMpegTsSource(activeSource)) {
        let mpegts;

        try {
          mpegts = (await import("mpegts.js")).default;
        } catch {
          fail("The MPEG-TS player could not be loaded.");
          return;
        }

        if (disposed) {
          return;
        }

        if (mpegts.getFeatureList().mseLivePlayback) {
          mpegtsPlayer = mpegts.createPlayer(
            {
              type: "mse",
              isLive: true,
              url: activeSource
            },
            {
              enableStashBuffer: false,
              liveBufferLatencyChasing: true,
              liveSync: true,
              reuseRedirectedURL: true
            }
          );
          mpegtsPlayer.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
            console.warn("[IPTV playback] MPEG-TS error", {
              route: activeSourceLabel,
              errorType,
              errorDetail,
              status: errorInfo?.code || errorInfo?.status
            });
            fail(getMpegTsErrorMessage(errorType, errorDetail, errorInfo));
          });
          mpegtsPlayer.attachMediaElement(video);
          mpegtsPlayer.load();
          mpegtsPlayer.play().catch(() => {
            setIsLoading(false);
            setNeedsUserPlay(true);
            setPlaybackError("Press Start Playback to play this stream.");
          });
          return;
        }

        fail("This browser does not support MPEG-TS live playback.");
        return;
      }

      if (activeSource.includes(".m3u8") && !supportsNativeHls) {
        let Hls;

        try {
          Hls = (await import("hls.js")).default;
        } catch {
          fail("The HLS player could not be loaded.");
          return;
        }

        if (disposed) {
          return;
        }

        if (Hls.isSupported()) {
          hls = new Hls({
            maxBufferLength: 18,
            backBufferLength: 30,
            fragLoadMaxRetry: 0,
            levelLoadMaxRetry: 0,
            manifestLoadMaxRetry: 0
          });
          hls.loadSource(activeSource);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_, data) => {
            if ([401, 403, 404].includes(data?.response?.code) || data.fatal) {
              console.warn("[IPTV playback] HLS error", {
                route: activeSourceLabel,
                details: data?.details,
                status: data?.response?.code
              });
              fail(getHlsErrorMessage(data));
            }
          });
        } else {
          video.src = activeSource;
        }
      } else {
        video.src = activeSource;
      }

      video.play().catch(() => {
        setIsLoading(false);
        setNeedsUserPlay(true);
        setPlaybackError("Press Start Playback to play this stream.");
      });
    }

    setupPlayback();

    return () => {
      disposed = true;
      clearStartupTimer();
      video.removeEventListener("playing", clearStartupTimer);
      video.removeEventListener("canplay", clearStartupTimer);
      if (hls) {
        hls.destroy();
      }
      if (mpegtsPlayer) {
        mpegtsPlayer.destroy();
      }
      video.removeAttribute("src");
      video.load();
    };
  }, [activeSource, activeSourceLabel, canTryNextSource]);

  function startPlayback() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setPlaybackError("");
    setNeedsUserPlay(false);
    video.play().catch(() => {
      setNeedsUserPlay(true);
      setPlaybackError("The browser still blocked playback. Press the video control play button.");
    });
  }

  function handleVideoError() {
    if (canTryNextSource) {
      setPlaybackError("Trying another stream format...");
      setSourceIndex((current) => current + 1);
      return;
    }

    const code = videoRef.current?.error?.code;
    const message =
      code === 4
        ? "This browser cannot play this stream format. If this is live TV, the provider may only allow native IPTV players."
        : "This stream could not be played by the current browser.";

    setIsLoading(false);
    setPlaybackError(message);
  }

  return (
    <div className="playerOverlay">
      <div className="playerTopbar">
        <div>
          <p className="eyebrow">Now playing</p>
          <h2>{item.name}</h2>
          {item.subtitle ? <span>{item.subtitle}</span> : null}
        </div>
        <button className="iconButton" type="button" onClick={onClose} data-focusable="true">
          <X size={28} />
          <span className="tooltip">Close</span>
        </button>
      </div>

      <video
        ref={videoRef}
        className="videoSurface"
        controls
        autoPlay
        playsInline
        data-focusable="true"
        onCanPlay={() => setIsLoading(false)}
        onPlaying={() => {
          setIsLoading(false);
          setNeedsUserPlay(false);
          setPlaybackError("");
        }}
        onError={handleVideoError}
      />

      {needsUserPlay ? (
        <button className="playOverlayButton" type="button" onClick={startPlayback} data-focusable="true">
          <Play size={26} fill="currentColor" />
          <span>Start Playback</span>
        </button>
      ) : null}

      {isLoading && !needsUserPlay ? (
        <div className="playerStatus">Loading stream via {activeSourceLabel}...</div>
      ) : null}

      {playbackError ? (
        <div className="playerNotice">
          <Maximize2 size={20} />
          <span>{playbackError}</span>
        </div>
      ) : null}
    </div>
  );
}

function getHlsErrorMessage(data) {
  const status = data?.response?.code;
  const details = data?.details || "HLS error";

  if (status === 401 || status === 403) {
    return `Provider rejected the video request with HTTP ${status}.`;
  }

  if (status === 404) {
    return "Provider returned HTTP 404. The channel may be offline or the playlist is outdated.";
  }

  if (status) {
    return `Provider returned HTTP ${status} while loading the stream.`;
  }

  return `Playback failed: ${details}.`;
}

function getMpegTsErrorMessage(errorType, errorDetail, errorInfo) {
  const status = errorInfo?.code || errorInfo?.status;

  if (status === 401 || status === 403) {
    return `Provider rejected the MPEG-TS stream with HTTP ${status}.`;
  }

  if (status === 404) {
    return "Provider returned HTTP 404 for the MPEG-TS stream.";
  }

  if (status) {
    return `MPEG-TS playback failed with HTTP ${status}.`;
  }

  return `MPEG-TS playback failed: ${errorDetail || errorType}.`;
}

function isMpegTsSource(url) {
  return /\.m2?ts(?:$|[?#])/i.test(url);
}

function getFinalPlaybackMessage(message) {
  if (message.includes("HTTP 401") || message.includes("HTTP 403")) {
    return `${message} All browser playback routes failed. Try another real channel or test the IPK on LG TV; if it still fails there, the provider is blocking this stream.`;
  }

  return message;
}

function getStartupTimeoutMessage(source, routeLabel) {
  if (isMpegTsSource(source)) {
    return `MPEG-TS loaded via ${routeLabel}, but the browser did not start playback. This often means the stream uses a codec Chrome cannot decode, such as HEVC/H.265 or AC3. Try a non-4K channel or test the IPK on LG TV.`;
  }

  return "Playback did not start in time.";
}

function expandDevProxySources(sourceUrls) {
  const sessionPrefix = makeSessionId();

  return sourceUrls.flatMap((url) => {
    const direct = { url, label: "direct" };

    if (!canUseDevProxy(url)) {
      return [direct];
    }

    return [
      {
        url: makeProxyUrl(url, "vlc", `${sessionPrefix}-vlc`),
        label: "VLC headers"
      },
      {
        url: makeProxyUrl(url, "smarttv", `${sessionPrefix}-smarttv`),
        label: "Smart TV headers"
      },
      {
        url: makeProxyUrl(url, "browser", `${sessionPrefix}-browser`),
        label: "local proxy"
      },
      direct
    ];
  });
}

function makeProxyUrl(url, profile, session) {
  return `/__stream_proxy?profile=${encodeURIComponent(profile)}&session=${encodeURIComponent(
    session
  )}&url=${encodeURIComponent(url)}`;
}

function makeSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function canUseDevProxy(url) {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }

  if (!["http:", "https:"].includes(window.location.protocol)) {
    return false;
  }

  return !url.startsWith(window.location.origin);
}

function maskPlaybackUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    const target = parsed.searchParams.get("url");

    if (target) {
      return `${parsed.pathname}?url=${maskPlaybackUrl(target)}`;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    const safePath = parts
      .map((part, index) => {
        if (part.length > 18 || /^[a-f0-9]{16,}$/i.test(part)) {
          return `${part.slice(0, 4)}...${part.slice(-4)}`;
        }

        if (index > 1 && /\d/.test(part)) {
          return part.replace(/\d/g, "x");
        }

        return part;
      })
      .join("/");

    return `${parsed.origin}/${safePath}`;
  } catch {
    return "stream-url";
  }
}
