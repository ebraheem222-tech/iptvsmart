import { useEffect } from "react";

const FOCUSABLE_SELECTOR =
  '[data-focusable="true"]:not([disabled]), input:not([disabled]), select:not([disabled]), video';

export function useSpatialNavigation(active = true) {
  useEffect(() => {
    if (!active) {
      return undefined;
    }

    function onKeyDown(event) {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        return;
      }

      const focusable = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (element) => isVisible(element)
      );
      const current = document.activeElement;
      const currentIndex = focusable.indexOf(current);

      if (currentIndex === -1 && focusable[0]) {
        focusable[0].focus();
        return;
      }

      const next = findNearest(current, focusable, event.key);
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);
}

function findNearest(current, candidates, key) {
  const currentRect = current.getBoundingClientRect();
  const currentCenter = getCenter(currentRect);
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate === current) {
      continue;
    }

    const rect = candidate.getBoundingClientRect();
    const center = getCenter(rect);
    const dx = center.x - currentCenter.x;
    const dy = center.y - currentCenter.y;

    if (!isInDirection(dx, dy, key)) {
      continue;
    }

    const primary = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dx) : Math.abs(dy);
    const secondary = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    const score = primary * 3 + secondary;

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function isInDirection(dx, dy, key) {
  if (key === "ArrowRight") return dx > 4;
  if (key === "ArrowLeft") return dx < -4;
  if (key === "ArrowDown") return dy > 4;
  if (key === "ArrowUp") return dy < -4;
  return false;
}

function getCenter(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
