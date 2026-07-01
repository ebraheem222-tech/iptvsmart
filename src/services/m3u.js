import { fetchText } from "./http.js";

export async function loadM3uPlaylist(url) {
  const text = await fetchText(url);
  return parseM3u(text);
}

export function parseM3u(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const channels = [];
  let pending = null;

  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      pending = parseExtInf(line);
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    if (pending) {
      const groupName = pending.attributes["group-title"] || "Uncategorized";
      channels.push({
        id: `m3u-${channels.length}-${line}`,
        streamId: line,
        name: pending.name || pending.attributes["tvg-name"] || "Untitled",
        categoryId: groupName,
        categoryName: groupName,
        logo: pending.attributes["tvg-logo"] || "",
        streamUrl: line,
        kind: "m3u",
        raw: pending
      });
      pending = null;
    }
  }

  const categoryNames = [...new Set(channels.map((channel) => channel.categoryName))];
  const categories = categoryNames.map((name) => ({
    id: name,
    name,
    type: "live"
  }));

  return { channels, categories };
}

function parseExtInf(line) {
  const [, attributeText = "", name = ""] = line.match(/^#EXTINF:[^ ]*\s*(.*?),(.*)$/) || [];
  const attributes = {};
  const attributePattern = /([\w-]+)="([^"]*)"/g;
  let match = attributePattern.exec(attributeText);

  while (match) {
    attributes[match[1]] = match[2];
    match = attributePattern.exec(attributeText);
  }

  return {
    attributes,
    name: name.trim()
  };
}
