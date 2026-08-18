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

vi.mock('../../src/components/error/AppErrorBoundary', () => ({
  AppErrorBoundary: (props: { children: ReactElement }) => props.children,
}));

vi.mock('../../src/App', () => ({
  default: () => null,
}));

interface ElementLike {
  type?: unknown;
  props?: { children?: unknown };
}

function findElementByType(element: unknown, type: unknown): boolean {
  if (element === null || typeof element !== 'object') return false;
  const el = element as ElementLike;
  if (el.type === type) return true;
  const children = el.props?.children;
  if (Array.isArray(children)) {
    return children.some((child) => findElementByType(child, type));
  }
  return findElementByType(children, type);
}

function findTypeNestedInside(element: unknown, outerType: unknown, innerType: unknown): boolean {
  if (element === null || typeof element !== 'object') return false;
  const el = element as ElementLike;
  if (el.type === outerType) {
    return findElementByType(el.props?.children, innerType);
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

// T023 — R001, R002, R004, R007

describe('main.tsx — bootstrap initializes tracking and wraps the tree (R001, R002, R004, R007)', () => {
  it('WHEN main.tsx is imported THEN initErrorTracking runs before createRoot(...).render(...), and the rendered tree wraps App in AppErrorBoundary', async () => {
    await import('../../src/main');

    const { initErrorTracking } = await import('../../src/lib/errorTracking');
    const { AppErrorBoundary } = await import('../../src/components/error/AppErrorBoundary');
    const AppModule = await import('../../src/App');

    const mockInit = initErrorTracking as ReturnType<typeof vi.fn>;

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(mockInit.mock.invocationCallOrder[0]).toBeLessThan(
      mockRender.mock.invocationCallOrder[0],
    );

    const renderedTree = mockRender.mock.calls[0][0];

    expect(findElementByType(renderedTree, AppErrorBoundary)).toBe(true);
    expect(findTypeNestedInside(renderedTree, AppErrorBoundary, AppModule.default)).toBe(true);
  });
});
