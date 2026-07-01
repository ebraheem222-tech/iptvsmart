import { fetchJson } from "./http.js";

const CATEGORY_ACTIONS = {
  live: "get_live_categories",
  vod: "get_vod_categories",
  series: "get_series_categories"
};

const ITEM_ACTIONS = {
  live: "get_live_streams",
  vod: "get_vod_streams",
  series: "get_series"
};

const PLAYBACK_PATHS = {
  live: "live",
  vod: "movie",
  episode: "series"
};

export function normalizeServerUrl(server) {
  let trimmed = server.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }

  trimmed = trimmed
    .replace(/^ttp:\/\//i, "http://")
    .replace(/^ttp\/\//i, "http://")
    .replace(/^http\/\//i, "http://")
    .replace(/^https\/\//i, "https://");

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

export async function loadXtreamAccount(profile) {
  const account = await fetchJson(buildApiUrl(profile));
  const auth = Number(account?.user_info?.auth ?? 0);

  if (!account?.user_info || auth !== 1) {
    throw new Error("Login failed. The provider rejected these IPTV credentials.");
  }

  return account;
}

export async function loadXtreamCategories(profile) {
  const entries = await Promise.all(
    Object.entries(CATEGORY_ACTIONS).map(async ([type, action]) => {
      const categories = await fetchJson(buildApiUrl(profile, action));
      return [type, normalizeCategories(categories, type)];
    })
  );

  return Object.fromEntries(entries);
}

export async function loadXtreamItems(profile, type, categoryId = "all") {
  const action = ITEM_ACTIONS[type];
  if (!action) {
    return [];
  }

  const params =
    categoryId && categoryId !== "all" ? { category_id: categoryId } : {};
  const items = await fetchJson(buildApiUrl(profile, action, params));
  return normalizeItems(items, type);
}

export async function loadSeriesEpisodes(profile, seriesId) {
  const data = await fetchJson(
    buildApiUrl(profile, "get_series_info", { series_id: seriesId })
  );
  const episodesBySeason = data?.episodes ?? {};

  return Object.entries(episodesBySeason).flatMap(([seasonNumber, episodes]) =>
    ensureArray(episodes).map((episode) => ({
      id: `episode-${episode.id}`,
      streamId: episode.id,
      name: episode.title || episode.name || `Episode ${episode.episode_num || ""}`,
      subtitle: `Season ${seasonNumber}${
        episode.episode_num ? ` / Episode ${episode.episode_num}` : ""
      }`,
      logo: episode.info?.movie_image || episode.info?.cover_big || "",
      rating: episode.info?.rating || "",
      year: episode.info?.releasedate?.slice?.(0, 4) || "",
      containerExtension: episode.container_extension || "mp4",
      kind: "episode",
      raw: episode
    }))
  );
}

export function getXtreamPlaybackUrl(profile, item, type) {
  return getXtreamPlaybackSources(profile, item, type)[0];
}

export function getXtreamPlaybackSources(profile, item, type) {
  const server = normalizeServerUrl(profile.server);
  const path = PLAYBACK_PATHS[item.kind === "episode" ? "episode" : type];
  const baseUrl = `${server}/${path}/${encodeURIComponent(profile.username)}/${encodeURIComponent(
    profile.password
  )}/${item.streamId}`;
  const directSource = item.directSource?.trim();

  if (type === "live") {
    const extensions = unique([
      "ts",
      item.containerExtension,
      "m3u8"
    ]).filter(Boolean);

    return unique([
      ...extensions.map((extension) => `${baseUrl}.${extension}`),
      directSource
    ]).filter(Boolean);
  }

  const extension = item.containerExtension || "mp4";
  return unique([`${baseUrl}.${extension}`, directSource]).filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function buildApiUrl(profile, action, params = {}) {
  const server = normalizeServerUrl(profile.server);
  const url = new URL("player_api.php", `${server}/`);
  url.searchParams.set("username", profile.username.trim());
  url.searchParams.set("password", profile.password.trim());

  if (action) {
    url.searchParams.set("action", action);
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

function normalizeCategories(categories, type) {
  return ensureArray(categories).map((category) => ({
    id: String(category.category_id),
    name: category.category_name || "Other",
    type
  }));
}

function normalizeItems(items, type) {
  return ensureArray(items).map((item) => ({
    id: `${type}-${item.stream_id || item.series_id}`,
    streamId: item.stream_id || item.series_id,
    name: item.name || item.title || "Untitled",
    categoryId: String(item.category_id || ""),
    logo: item.stream_icon || item.cover || item.cover_big || "",
    rating: item.rating || "",
    year: item.release_date?.slice?.(0, 4) || item.year || "",
    containerExtension: item.container_extension || (type === "live" ? "m3u8" : "mp4"),
    directSource: item.direct_source || "",
    kind: type === "series" ? "series" : type,
    raw: item
  }));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}
