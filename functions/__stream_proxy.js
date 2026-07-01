import { handleStreamProxy } from "../worker/index.js";

export function onRequest(context) {
  return handleStreamProxy(context.request);
}
