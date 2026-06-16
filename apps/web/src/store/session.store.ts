import { create } from 'zustand';

// extensible — populated by future auth feature
interface SessionState {}

export const useSessionStore = create<SessionState>()(() => ({}));
