import posthog from "posthog-js";

export interface TrafficOrigin {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  referrer: string | null;
}

export function parseTrafficOrigin(search: string, referrer: string): TrafficOrigin {
  const params = new URLSearchParams(search);

  return {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    utmTerm: params.get("utm_term"),
    utmContent: params.get("utm_content"),
    referrer: referrer || null,
  };
}

export function registerTrafficOrigin(origin: TrafficOrigin): void {
  // register_once never overwrites a previously persisted value, so the
  // first traffic origin ever recorded for this visitor is retained (EC003).
  posthog.register_once({
    first_touch_utm_source: origin.utmSource,
    first_touch_utm_medium: origin.utmMedium,
    first_touch_utm_campaign: origin.utmCampaign,
    first_touch_utm_term: origin.utmTerm,
    first_touch_utm_content: origin.utmContent,
    first_touch_referrer: origin.referrer,
  });

  // register always overwrites, so the current visit's origin is kept
  // alongside the first-touch values rather than replacing them.
  posthog.register({
    last_touch_utm_source: origin.utmSource,
    last_touch_utm_medium: origin.utmMedium,
    last_touch_utm_campaign: origin.utmCampaign,
    last_touch_utm_term: origin.utmTerm,
    last_touch_utm_content: origin.utmContent,
    last_touch_referrer: origin.referrer,
  });
}
