import { create } from 'zustand';

// extensible — populated by future UI-state features
interface UiState {}

export const useUiStore = create<UiState>()(() => ({}));
