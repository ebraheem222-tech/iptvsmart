import {
  Clapperboard,
  Heart,
  ListVideo,
  Loader2,
  LogOut,
  MonitorPlay,
  Play,
  RadioTower,
  Search,
  Star,
  Tv,
  UserRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Player from "./components/Player.jsx";
import { useSpatialNavigation } from "./hooks/useSpatialNavigation.js";
import { loadM3uPlaylist } from "./services/m3u.js";
import {
  getXtreamPlaybackSources,
  loadSeriesEpisodes,
  loadXtreamAccount,
  loadXtreamCategories,
  loadXtreamItems,
  normalizeServerUrl
} from "./services/xtream.js";

const PROFILE_KEY = "iptv-smart-profile";
const FAVORITES_KEY = "iptv-smart-favorites";

const CONTENT_TYPES = [
  { id: "live", label: "Live TV", icon: RadioTower },
  { id: "vod", label: "Movies", icon: Clapperboard },
  { id: "series", label: "Series", icon: ListVideo }
];

const EMPTY_CATEGORIES = {
  live: [],
  vod: [],
  series: []
};

const DEFAULT_FORM = {
  mode: "xtream",
  name: "",
  server: "",
  username: "",
  password: "",
  m3uUrl: ""
};

export default function App() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [profile, setProfile] = useState(null);
  const [account, setAccount] = useState(null);
  const [categories, setCategories] = useState(EMPTY_CATEGORIES);
  const [items, setItems] = useState([]);
  const [contentType, setContentType] = useState("live");
  const [categoryId, setCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [message, setMessage] = useState("");
  const [player, setPlayer] = useState(null);
  const [seriesContext, setSeriesContext] = useState(null);
  const [favorites, setFavorites] = useState(() => readJson(FAVORITES_KEY, []));

  useSpatialNavigation(true);

  useEffect(() => {
    const saved = readJson(PROFILE_KEY, null);
    if (saved) {
      setForm({ ...DEFAULT_FORM, ...saved });
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    function onKeyDown(event) {
      const code = event.keyCode || event.which;
      const isBack = event.key === "Escape" || event.key === "Backspace" || code === 10009 || code === 461;

      if (!isBack) {
        return;
      }

      if (player) {
        event.preventDefault();
        setPlayer(null);
      } else if (seriesContext) {
        event.preventDefault();
        exitSeriesEpisodes();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [player, seriesContext]);

  const activeCategories = categories[contentType] || [];

  const filteredItems = useMemo(() => {
    const playableItems = items.filter((item) => !isLikelySeparator(item));
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return playableItems;
    }

    return playableItems.filter((item) => item.name.toLowerCase().includes(needle));
  }, [items, search]);

  const activeCategoryName =
    categoryId === "all"
      ? "All"
      : activeCategories.find((category) => category.id === categoryId)?.name || "Selected";

  async function connect(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setSeriesContext(null);
    setPlayer(null);

    try {
      if (form.mode === "xtream") {
        const nextProfile = {
          mode: "xtream",
          name: form.name.trim() || getHost(normalizeServerUrl(form.server)),
          server: normalizeServerUrl(form.server),
          username: form.username.trim(),
          password: form.password.trim()
        };

        validateXtream(nextProfile);
        const [nextAccount, nextCategories] = await Promise.all([
          loadXtreamAccount(nextProfile),
          loadXtreamCategories(nextProfile)
        ]);

        setProfile(nextProfile);
        setAccount(nextAccount);
        setCategories(nextCategories);
        setContentType("live");
        setCategoryId("all");
        window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
        await loadItems(nextProfile, "live", "all");
      } else {
        const nextProfile = {
          mode: "m3u",
          name: form.name.trim() || "M3U playlist",
          m3uUrl: form.m3uUrl.trim()
        };

        validateM3u(nextProfile);
        const playlist = await loadM3uPlaylist(nextProfile.m3uUrl);
        setProfile(nextProfile);
        setAccount({
          user_info: {
            status: "Playlist",
            exp_date: "",
            max_connections: ""
          }
        });
        setCategories({ live: playlist.categories, vod: [], series: [] });
        setContentType("live");
        setCategoryId("all");
        setItems(playlist.channels);
        window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadItems(nextProfile = profile, nextType = contentType, nextCategoryId = categoryId) {
    if (!nextProfile) {
      return;
    }

    setLoadingItems(true);
    setMessage("");
    setSearch("");
    setSeriesContext(null);

    try {
      if (nextProfile.mode === "m3u") {
        const playlist = await loadM3uPlaylist(nextProfile.m3uUrl);
        const nextItems =
          nextCategoryId === "all"
            ? playlist.channels
            : playlist.channels.filter((channel) => channel.categoryId === nextCategoryId);
        setItems(nextItems);
      } else {
        const nextItems = await loadXtreamItems(nextProfile, nextType, nextCategoryId);
        setItems(nextItems);
      }
    } catch (error) {
      setItems([]);
      setMessage(error.message);
    } finally {
      setLoadingItems(false);
    }
  }

  function chooseContentType(nextType) {
    if (nextType !== "live" && profile?.mode === "m3u") {
      return;
    }

    setContentType(nextType);
    setCategoryId("all");
    loadItems(profile, nextType, "all");
  }

  function chooseCategory(nextCategoryId) {
    setCategoryId(nextCategoryId);
    loadItems(profile, contentType, nextCategoryId);
  }

  async function openItem(item) {
    if (!profile) {
      return;
    }

    if (isLikelySeparator(item)) {
      setMessage("This item looks like a category header, not a playable channel. Choose a real channel below it.");
      return;
    }

    if (profile.mode === "xtream" && contentType === "series" && item.kind === "series") {
      setLoadingItems(true);
      setMessage("");

      try {
        const episodes = await loadSeriesEpisodes(profile, item.streamId);
        setSeriesContext({
          series: item,
          previousItems: items,
          previousCategoryId: categoryId
        });
        setItems(episodes);
      } catch (error) {
        setMessage(error.message);
      } finally {
        setLoadingItems(false);
      }
      return;
    }

    const sources =
      profile.mode === "m3u"
        ? [item.streamUrl]
        : getXtreamPlaybackSources(profile, item, contentType);

    setPlayer({ item, sources });
  }

  function exitSeriesEpisodes() {
    if (!seriesContext) {
      return;
    }

    setItems(seriesContext.previousItems);
    setCategoryId(seriesContext.previousCategoryId);
    setSeriesContext(null);
  }

  function toggleFavorite(item) {
    setFavorites((current) => {
      const key = favoriteKey(item);
      return current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key];
    });
  }

  function logout() {
    setProfile(null);
    setAccount(null);
    setCategories(EMPTY_CATEGORIES);
    setItems([]);
    setMessage("");
    setPlayer(null);
    setSeriesContext(null);
    window.localStorage.removeItem(PROFILE_KEY);
  }

  if (!profile) {
    return (
      <main className="loginShell">
        <section className="brandPanel">
          <div className="brandMark">
            <Tv size={42} />
          </div>
          <p className="eyebrow">Free IPTV player</p>
          <h1>IPTV Smart Player</h1>
          <p className="legalNote">
            This app does not provide channels or subscriptions. Use your own legal IPTV provider
            credentials.
          </p>
        </section>

        <form className="loginForm" onSubmit={connect}>
          <div className="modeSwitch" role="tablist" aria-label="Login type">
            <button
              type="button"
              className={form.mode === "xtream" ? "active" : ""}
              onClick={() => setForm((current) => ({ ...current, mode: "xtream" }))}
              data-focusable="true"
            >
              Xtream Codes
            </button>
            <button
              type="button"
              className={form.mode === "m3u" ? "active" : ""}
              onClick={() => setForm((current) => ({ ...current, mode: "m3u" }))}
              data-focusable="true"
            >
              M3U URL
            </button>
          </div>

          {form.mode === "xtream" ? (
            <>
              <label>
                Profile name
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Example: My IPTV"
                  autoFocus
                />
              </label>
              <label>
                Server URL
                <input
                  value={form.server}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, server: event.target.value }))
                  }
                  placeholder="http://provider.example:8080"
                />
              </label>
              <label>
                Username
                <input
                  value={form.username}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, username: event.target.value }))
                  }
                  placeholder="Your IPTV username"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="Your IPTV password"
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Profile name
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Example: Family playlist"
                  autoFocus
                />
              </label>
              <label>
                M3U playlist URL
                <input
                  value={form.m3uUrl}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, m3uUrl: event.target.value }))
                  }
                  placeholder="https://provider.example/playlist.m3u"
                />
              </label>
            </>
          )}

          {message ? <div className="errorBanner">{message}</div> : null}

          <button className="primaryButton" type="submit" disabled={loading} data-focusable="true">
            {loading ? <Loader2 className="spin" size={22} /> : <MonitorPlay size={22} />}
            <span>{loading ? "Connecting" : "Open subscription"}</span>
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="sidebarBrand">
          <Tv size={30} />
          <div>
            <strong>{profile.name || "IPTV Smart"}</strong>
            <span>{profile.mode === "xtream" ? getHost(profile.server) : "M3U playlist"}</span>
          </div>
        </div>

        <nav className="contentTabs" aria-label="Content">
          {CONTENT_TYPES.map((type) => {
            const Icon = type.icon;
            const disabled = profile.mode === "m3u" && type.id !== "live";
            return (
              <button
                key={type.id}
                type="button"
                className={contentType === type.id ? "active" : ""}
                onClick={() => chooseContentType(type.id)}
                disabled={disabled}
                data-focusable="true"
              >
                <Icon size={22} />
                <span>{type.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="accountBox">
          <UserRound size={20} />
          <div>
            <span>Status</span>
            <strong>{formatStatus(account?.user_info?.status)}</strong>
          </div>
        </div>

        <button className="ghostButton" type="button" onClick={logout} data-focusable="true">
          <LogOut size={20} />
          <span>Sign out</span>
        </button>
      </aside>

      <section className="contentArea">
        <header className="topbar">
          <div>
            <p className="eyebrow">{seriesContext ? seriesContext.series.name : activeCategoryName}</p>
            <h1>{seriesContext ? "Episodes" : CONTENT_TYPES.find((type) => type.id === contentType)?.label}</h1>
          </div>

          <div className="searchBox">
            <Search size={20} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              aria-label="Search"
            />
          </div>
        </header>

        {message ? <div className="errorBanner contentError">{message}</div> : null}

        {!seriesContext ? (
          <div className="categoryRail" aria-label="Categories">
            <button
              type="button"
              className={categoryId === "all" ? "active" : ""}
              onClick={() => chooseCategory("all")}
              data-focusable="true"
            >
              All
            </button>
            {activeCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={categoryId === category.id ? "active" : ""}
                onClick={() => chooseCategory(category.id)}
                data-focusable="true"
              >
                {category.name}
              </button>
            ))}
          </div>
        ) : (
          <button className="backButton" type="button" onClick={exitSeriesEpisodes} data-focusable="true">
            Back to series
          </button>
        )}

        <section className="resultsHeader">
          <span>{filteredItems.length} items</span>
          {loadingItems ? (
            <span className="loadingInline">
              <Loader2 className="spin" size={18} /> Loading
            </span>
          ) : null}
        </section>

        <section className="contentGrid" aria-label="Content list">
          {filteredItems.map((item) => {
            const favorite = favorites.includes(favoriteKey(item));
            return (
              <article
                key={item.id}
                className="mediaCard"
                tabIndex={0}
                data-focusable="true"
                onClick={() => openItem(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    openItem(item);
                  }
                }}
              >
                <div className="poster">
                  {item.logo ? <img src={item.logo} alt="" loading="lazy" /> : <Tv size={42} />}
                  <button
                    type="button"
                    className={`favoriteButton ${favorite ? "active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(item);
                    }}
                    data-focusable="true"
                  >
                    {favorite ? <Heart size={18} fill="currentColor" /> : <Star size={18} />}
                    <span className="tooltip">Favorite</span>
                  </button>
                </div>
                <div className="mediaMeta">
                  <h3>{item.name}</h3>
                  <p>{item.subtitle || item.year || item.rating || (contentType === "series" ? "Open episodes" : "Ready to play")}</p>
                </div>
                <div className="playHint">
                  <Play size={18} />
                </div>
              </article>
            );
          })}
        </section>

        {!loadingItems && filteredItems.length === 0 ? (
          <div className="emptyState">
            <Tv size={46} />
            <h2>No items found</h2>
            <p>Try another category or check the provider subscription.</p>
          </div>
        ) : null}
      </section>

      {player ? <Player item={player.item} sources={player.sources} onClose={() => setPlayer(null)} /> : null}
    </main>
  );
}

function validateXtream(profile) {
  if (!profile.server || !profile.username || !profile.password) {
    throw new Error("Enter server URL, username, and password.");
  }
}

function validateM3u(profile) {
  if (!profile.m3uUrl) {
    throw new Error("Enter the M3U playlist URL.");
  }
}

function readJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function favoriteKey(item) {
  return `${item.kind}:${item.streamId || item.id}`;
}

function formatStatus(status) {
  if (!status) {
    return "Unknown";
  }

  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function getHost(server) {
  try {
    return new URL(server).host;
  } catch {
    return server;
  }
}

function isLikelySeparator(item) {
  return /^#{3,}.*#{3,}$/.test(item.name.trim());
}
