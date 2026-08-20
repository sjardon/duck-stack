import { getDistinctId } from "./analytics";

export function buildHandoffUrl(path: string): string {
  const baseUrl = `${import.meta.env.VITE_WEB_URL}${path}`;

  const distinctId = getDistinctId();
  if (!distinctId) return baseUrl;

  const separator = path.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}landing_id=${distinctId}`;
}
