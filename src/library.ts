// The built-in library. Each book ships as a static PDF under public/library/
// and is identified by a stable `id` (used as the cross-device sync key for
// bookmarks/scribbles, so it must not change once published).
export interface LibraryBook {
  id: string;
  title: string;
  author?: string;
  // Path relative to the app base (import.meta.env.BASE_URL).
  file: string;
}

export const LIBRARY: LibraryBook[] = [
  {
    id: 'mfg',
    title: 'Graphon Mean Field Games',
    file: 'library/mfg/main.pdf',
  },
  {
    id: 'qft',
    title: 'Modern Quantum Field Theory: From Foundations to the Frontier',
    file: 'library/qft/main.pdf',
  },
];
