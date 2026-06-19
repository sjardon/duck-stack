import { create } from 'zustand';

interface SessionState {
  userId: string | null;
  token: () => Promise<string | null>;
}

export const useSessionStore = create<SessionState>()(() => ({
  userId: null,
  token: async () => null,
}));
