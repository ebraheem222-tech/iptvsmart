const DEFAULT_TIMEOUT_MS = 25000;

export async function fetchText(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, timeoutMs);
  return response.text();
}

export async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, timeoutMs);
  return response.json();
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const requestUrl = getApiRequestUrl(url);

  try {
    const response = await fetch(requestUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*"
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The provider did not respond in time.");
    }

    throw new Error(
      "Could not connect to the provider. Check the URL, credentials, HTTPS/CORS support, and network."
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

function getApiRequestUrl(url) {
  if (!shouldProxyUrl(url)) {
    return url;
  }

  return `/__api_proxy?url=${encodeURIComponent(url)}`;
}

function shouldProxyUrl(url) {
  if (!["http:", "https:"].includes(window.location.protocol)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.origin !== window.location.origin;
  } catch {
    return false;
  }
}
