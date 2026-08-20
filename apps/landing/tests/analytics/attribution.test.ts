import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    register_once: vi.fn(),
    register: vi.fn(),
  },
}));

import posthog from 'posthog-js';
import { parseTrafficOrigin, registerTrafficOrigin } from '../../src/lib/attribution';

const mockRegisterOnce = posthog.register_once as ReturnType<typeof vi.fn>;
const mockRegister = posthog.register as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// T008 — R002, EC003

describe('parseTrafficOrigin — extracts UTM params and referrer (R002)', () => {
  it('reads utm_source/utm_medium/utm_campaign/utm_term/utm_content and referrer from the query string', () => {
    const origin = parseTrafficOrigin(
      '?utm_source=google&utm_medium=cpc&utm_campaign=launch&utm_term=saas&utm_content=banner',
      'https://google.com/search',
    );

    expect(origin).toEqual({
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'launch',
      utmTerm: 'saas',
      utmContent: 'banner',
      referrer: 'https://google.com/search',
    });
  });

  it('returns null fields when no UTM params or referrer are present', () => {
    const origin = parseTrafficOrigin('', '');

    expect(origin.utmSource).toBeNull();
    expect(origin.utmMedium).toBeNull();
    expect(origin.utmCampaign).toBeNull();
    expect(origin.utmTerm).toBeNull();
    expect(origin.utmContent).toBeNull();
    expect(origin.referrer).toBeNull();
  });
});

describe('registerTrafficOrigin — first-touch/last-touch super properties (R002, EC003)', () => {
  it('calls register_once with first_touch_* fields and register with last_touch_* fields', () => {
    registerTrafficOrigin({
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'launch',
      utmTerm: null,
      utmContent: null,
      referrer: 'https://google.com',
    });

    expect(mockRegisterOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        first_touch_utm_source: 'google',
        first_touch_utm_medium: 'cpc',
        first_touch_utm_campaign: 'launch',
        first_touch_referrer: 'https://google.com',
      }),
    );
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        last_touch_utm_source: 'google',
        last_touch_utm_medium: 'cpc',
        last_touch_utm_campaign: 'launch',
        last_touch_referrer: 'https://google.com',
      }),
    );
  });

  it('a second call with an empty origin still calls register_once (never overwrites first-touch) while register reflects the new last-touch values', () => {
    registerTrafficOrigin({
      utmSource: 'google',
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      referrer: null,
    });

    registerTrafficOrigin({
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      referrer: null,
    });

    expect(mockRegisterOnce).toHaveBeenCalledTimes(2);
    expect(mockRegister).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ last_touch_utm_source: null }),
    );
  });
});
