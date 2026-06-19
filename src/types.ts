export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  width: number;
  tool: 'pencil' | 'highlighter' | 'eraser';
}

export interface BookmarksRegistry {
  [pageNumber: number]: string; // pageNumber -> label
}

export interface PageDrawingsRegistry {
  [pageNumber: number]: Stroke[]; // pageNumber -> strokes
}

export interface Bookmark {
  id: string;
  pageNumber: number;
  label: string;
  timestamp: number;
}

export interface HistoryEntry {
  id: string;
  pageNumber: number;
  sectionName?: string;
  timestamp: number;
  reason: 'jump' | 'read' | 'toc' | 'annotated';
}

export interface ViewerPanelState {
  id: 'left' | 'right';
  mode: 'pdf' | 'whiteboard' | 'none';
  currentPage: number;
}

export interface TocItem {
  title: string;
  pageNumber: number;
  level: number;
  dest?: any;
  isResolving?: boolean;
}

export type DrawingTool = 'select' | 'pencil' | 'highlighter' | 'eraser';
export type DrawingColor = 'cyan' | 'green' | 'pink' | 'yellow' | 'white';
export type BrushSize = 2 | 5 | 10 | 18;
