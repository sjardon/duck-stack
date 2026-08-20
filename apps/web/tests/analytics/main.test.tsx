import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';

const mockRender = vi.fn();
const mockCreateRoot = vi.fn(() => ({ render: mockRender }));

vi.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
}));

vi.mock('../../src/lib/errorTracking', () => ({
  initErrorTracking: vi.fn(),
}));

const posthogClient = { identify: vi.fn(), reset: vi.fn(), capture: vi.fn() };

vi.mock('../../src/lib/analytics', () => ({
  initAnalytics: vi.fn(),
  adoptPropagatedIdentity: vi.fn(),
  posthog: posthogClient,
}));

vi.mock('@posthog/react', () => ({
  PostHogProvider: (props: { children: ReactElement; client?: unknown }) => props.children,
}));

vi.mock('../../src/components/error/AppErrorBoundary', () => ({
  AppErrorBoundary: (props: { children: ReactElement }) => props.children,
}));

vi.mock('../../src/App', () => ({
  default: () => null,
}));

interface ElementLike {
  type?: unknown;
  props?: { children?: unknown; client?: unknown };
}

function findElementByType(element: unknown, type: unknown): ElementLike | null {
  if (element === null || typeof element !== 'object') return null;
  const el = element as ElementLike;
  if (el.type === type) return el;
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElementByType(child, type);
      if (found) return found;
    }
    return null;
  }
  return findElementByType(children, type);
}

function findTypeNestedInside(element: unknown, outerType: unknown, innerType: unknown): boolean {
  if (element === null || typeof element !== 'object') return false;
  const el = element as ElementLike;
  if (el.type === outerType) {
    return findElementByType(el.props?.children, innerType) !== null;
  }
  const children = el.props?.children;
  if (Array.isArray(children)) {
    return children.some((child) => findTypeNestedInside(child, outerType, innerType));
  }
  return findTypeNestedInside(children, outerType, innerType);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_123');
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// T031 — R001, R002, R004, R007, R008

describe('main.tsx — bootstrap initializes analytics and wraps the tree (R001, R002, R004, R007, R008)', () => {
  it('WHEN main.tsx is imported THEN initAnalytics runs before createRoot(...).render(...), and PostHogProvider (client=posthog) wraps App', async () => {
    await import('../../src/main');

    const { initAnalytics, posthog } = await import('../../src/lib/analytics');
    const { PostHogProvider } = await import('@posthog/react');
    const AppModule = await import('../../src/App');

    const mockInitAnalytics = initAnalytics as ReturnType<typeof vi.fn>;

    expect(mockInitAnalytics).toHaveBeenCalledTimes(1);
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(mockInitAnalytics.mock.invocationCallOrder[0]).toBeLessThan(
      mockRender.mock.invocationCallOrder[0],
    );

    const renderedTree = mockRender.mock.calls[0][0];

    const providerElement = findElementByType(renderedTree, PostHogProvider);
    expect(providerElement).not.toBeNull();
    expect(providerElement?.props?.client).toBe(posthog);
    expect(findTypeNestedInside(renderedTree, PostHogProvider, AppModule.default)).toBe(true);
  });
});

// T027 — R006, NF003

describe('main.tsx — bootstrap adopts propagated identity after initAnalytics, before render (R006, NF003)', () => {
  it('WHEN main.tsx is imported THEN adoptPropagatedIdentity runs after initAnalytics and before createRoot(...).render(...)', async () => {
    await import('../../src/main');

    const { initAnalytics, adoptPropagatedIdentity } = await import('../../src/lib/analytics');

    const mockInitAnalytics = initAnalytics as ReturnType<typeof vi.fn>;
    const mockAdoptPropagatedIdentity = adoptPropagatedIdentity as ReturnType<typeof vi.fn>;

    expect(mockAdoptPropagatedIdentity).toHaveBeenCalledTimes(1);
    expect(mockInitAnalytics.mock.invocationCallOrder[0]).toBeLessThan(
      mockAdoptPropagatedIdentity.mock.invocationCallOrder[0],
    );
    expect(mockAdoptPropagatedIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      mockRender.mock.invocationCallOrder[0],
    );
  });
});
