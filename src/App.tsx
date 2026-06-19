import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { 
  Stroke, 
  Bookmark, 
  HistoryEntry, 
  ViewerPanelState, 
  TocItem, 
  DrawingTool, 
  DrawingColor, 
  BrushSize,
  PageDrawingsRegistry
} from './types';
import { Sidebar } from './components/Sidebar';
import { PDFViewer } from './components/PDFViewer';
import { Whiteboard } from './components/Whiteboard';
import { 
  Menu, 
  Columns, 
  Square, 
  Link as LinkIcon, 
  Link2Off, 
  PenTool, 
  Highlighter, 
  Eraser, 
  Download, 
  Upload, 
  BookOpen,
  Trash2,
  X,
  MousePointer,
  Maximize2,
  Minimize2
} from 'lucide-react';

import { getPdfFromDb, savePdfToDb, clearPdfFromDb } from './utils/db';
import 'pdfjs-dist/web/pdf_viewer.css';

import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Nordic Minimalism Palette - Muted earth tones gentle on the eyes
const COLOR_MAP: Record<DrawingColor, string> = {
  cyan: '#7ea1a6',   // Soft Lichen Teal
  green: '#879b83',  // Soft Sage Green
  pink: '#ba8b84',   // Soft Terracotta Clay
  yellow: '#c4ae85', // Warm Sand
  white: '#dcdbd9',  // Soft Linen
};

export default function App() {
  // UI & Layout defaults (Sidebar is collapsed by default for Zen focus)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'toc' | 'bookmarks' | 'history'>('toc');
  const [layoutMode, setLayoutMode] = useState<'single' | 'split'>('split');
  const [linkedScrolling, setLinkedScrolling] = useState(false);
  const [globalZoom, setGlobalZoom] = useState(1.0);
  const [focusedPanel, setFocusedPanel] = useState<'left' | 'right'>('left');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Monitor browser fullscreen state change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };
  
  // Document loading
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const pdfDocumentRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  useEffect(() => {
    pdfDocumentRef.current = pdfDocument;
  }, [pdfDocument]);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initCheckingDb, setInitCheckingDb] = useState(true);
  const [isRestored, setIsRestored] = useState(false);
  const tocRef = useRef<TocItem[]>([]);

  // Panel State
  const [leftPanel, setLeftPanel] = useState<ViewerPanelState>({ id: 'left', mode: 'pdf', currentPage: 1 });
  const [rightPanel, setRightPanel] = useState<ViewerPanelState>({ id: 'right', mode: 'pdf', currentPage: 1 });

  // Drawing Toolbar Settings
  const [activeTool, setActiveTool] = useState<DrawingTool>('select');
  const [activeColor, setActiveColor] = useState<DrawingColor>('cyan');
  const [brushSize, setBrushSize] = useState<BrushSize>(5);

  // Persistence registries
  const [drawingsRegistry, setDrawingsRegistry] = useState<PageDrawingsRegistry>({});
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Bookmark naming modal
  const [bookmarkModalOpen, setBookmarkModalOpen] = useState(false);
  const [bookmarkModalPage, setBookmarkModalPage] = useState(1);
  const [bookmarkModalLabel, setBookmarkModalLabel] = useState('');

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tracking last history write coordinates to prevent floods
  const lastLogTime = useRef<number>(0);
  const lastLogPage = useRef<Record<'left' | 'right', number>>({ left: 1, right: 1 });

  // Sync ref to TOC for history component lookup
  useEffect(() => {
    tocRef.current = toc;
  }, [toc]);

  // Toast utility
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Check IndexedDB for cached PDF on mount
  useEffect(() => {
    const loadCachedPdf = async () => {
      try {
        const cached = await getPdfFromDb();
        if (cached) {
          setPdfFilename(cached.filename);
          setLoading(true);
          const loadingTask = pdfjsLib.getDocument({ data: cached.data });
          const doc = await loadingTask.promise;
          setPdfDocument(doc);
          setLoading(false);
          showToast('Restored offline PDF document.');

          // Extract outline progressively in the background without blocking the UI
          extractToc(doc);
        }
      } catch (err: any) {
        console.error('Failed to restore cached PDF:', err);
        setError(`Failed to restore cached document: ${err.message || err.toString()}`);
      } finally {
        setInitCheckingDb(false);
      }
    };
    loadCachedPdf();
  }, []);

  // Restore persistence registries when pdfFilename is loaded or changes
  useEffect(() => {
    setIsRestored(false); // Halt session saving until restoration is applied

    if (!pdfFilename) {
      setDrawingsRegistry({});
      setBookmarks([]);
      setHistory([]);
      return;
    }

    const savedDrawings = localStorage.getItem(`aethelgard_drawings_${pdfFilename}`);
    const savedBookmarks = localStorage.getItem(`aethelgard_bookmarks_${pdfFilename}`);
    const savedHistory = localStorage.getItem(`aethelgard_history_${pdfFilename}`);
    
    if (savedDrawings) {
      try { setDrawingsRegistry(JSON.parse(savedDrawings)); } catch(e) { setDrawingsRegistry({}); }
    } else {
      setDrawingsRegistry({});
    }
    if (savedBookmarks) {
      try { setBookmarks(JSON.parse(savedBookmarks)); } catch(e) { setBookmarks([]); }
    } else {
      setBookmarks([]);
    }
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch(e) { setHistory([]); }
    } else {
      setHistory([]);
    }

    // Reset tracking refs for scroll logging
    lastLogPage.current = { left: 1, right: 1 };
    lastLogTime.current = 0;

    // Restore reader session positions specific to this document
    const savedSession = localStorage.getItem(`aethelgard_session_${pdfFilename}`);
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        if (session.layoutMode) setLayoutMode(session.layoutMode);
        if (session.linkedScrolling !== undefined) setLinkedScrolling(session.linkedScrolling);
        if (session.globalZoom) setGlobalZoom(session.globalZoom);
        if (session.leftPage) setLeftPanel(prev => ({ ...prev, currentPage: session.leftPage }));
        if (session.rightPage) setRightPanel(prev => ({ ...prev, currentPage: session.rightPage }));
        if (session.sidebarCollapsed !== undefined) setSidebarCollapsed(session.sidebarCollapsed);
        if (session.activeSidebarTab) setActiveSidebarTab(session.activeSidebarTab);
      } catch (e) {
        console.error('Failed to load saved reader session', e);
      }
    } else {
      // Default values for a new book
      setLeftPanel({ id: 'left', mode: 'pdf', currentPage: 1 });
      setRightPanel({ id: 'right', mode: 'pdf', currentPage: 1 });
      setGlobalZoom(1.0);
      setLayoutMode('split');
      setLinkedScrolling(false);
    }

    setIsRestored(true); // Allow saving now that the state has been restored
  }, [pdfFilename]);

  // Save session state to localStorage keyed by active PDF filename
  useEffect(() => {
    if (!pdfDocument || !pdfFilename || !isRestored) return; // Prevent overwriting during initialization
    const session = {
      layoutMode,
      linkedScrolling,
      globalZoom,
      leftPage: leftPanel.currentPage,
      rightPage: rightPanel.currentPage,
      sidebarCollapsed,
      activeSidebarTab,
    };
    localStorage.setItem(`aethelgard_session_${pdfFilename}`, JSON.stringify(session));
  }, [pdfFilename, layoutMode, linkedScrolling, globalZoom, leftPanel.currentPage, rightPanel.currentPage, sidebarCollapsed, activeSidebarTab, pdfDocument, isRestored]);

  const loadFile = async (file: File) => {
    setLoading(true);
    setError(null);
    setPdfDocument(null);
    setToc([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Cache binary in IndexedDB
      await savePdfToDb(file.name, arrayBuffer);
      setPdfFilename(file.name);

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const doc = await loadingTask.promise;
      setPdfDocument(doc);
      setLoading(false);
      showToast('Document loaded and cached offline.');

      // Extract outline progressively in the background without blocking the UI
      extractToc(doc);
    } catch (err: any) {
      console.error('Failed to load selected PDF:', err);
      setError(`Failed to load PDF document: ${err.message || err.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  const closeDocument = async () => {
    if (window.confirm('Close this document? All your annotations and history will remain saved.')) {
      setLoading(true);
      try {
        await clearPdfFromDb();
        setPdfDocument(null);
        setPdfFilename(null);
        setError(null);
        setIsRestored(false);
      } catch (err) {
        console.error('Failed to clear PDF cache:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  // Extract outline items recursively
  const extractToc = async (pdf: pdfjsLib.PDFDocumentProxy): Promise<void> => {
    try {
      const outline = await pdf.getOutline();
      if (!outline) {
        setToc([]);
        return;
      }
      
      const flatOutline: TocItem[] = [];
      const traverse = (items: any[], level: number) => {
        for (const item of items) {
          flatOutline.push({
            title: item.title || 'Untitled',
            pageNumber: 1,
            level,
            dest: item.dest,
            isResolving: true,
          });
          if (item.items && item.items.length > 0) {
            traverse(item.items, level + 1);
          }
        }
      };
      traverse(outline, 1);
      
      // Set initial outline immediately to let the sidebar populate
      setToc(flatOutline);

      // Now resolve page numbers progressively in the background
      resolvePageNumbersProgressively(pdf, flatOutline);
    } catch (e) {
      console.error('Error loading outline:', e);
      setToc([]);
    }
  };

  const resolvePageNumbersProgressively = async (pdf: pdfjsLib.PDFDocumentProxy, items: TocItem[]) => {
    const updatedItems = [...items];
    const chunkSize = 20;
    
    for (let i = 0; i < updatedItems.length; i += chunkSize) {
      // Check if document has changed or closed in the middle of resolving
      if (pdfDocumentRef.current !== pdf) return;

      const chunk = updatedItems.slice(i, i + chunkSize);
      
      await Promise.all(
        chunk.map(async (item, index) => {
          const itemIdx = i + index;
          if (!item.dest) {
            updatedItems[itemIdx] = { ...item, isResolving: false };
            return;
          }
          try {
            let dest = item.dest;
            if (typeof dest === 'string') {
              dest = await pdf.getDestination(dest);
            }
            if (Array.isArray(dest)) {
              const destRef = dest[0];
              const pageIdx = await pdf.getPageIndex(destRef);
              updatedItems[itemIdx] = {
                ...item,
                pageNumber: pageIdx + 1,
                isResolving: false
              };
            } else {
              updatedItems[itemIdx] = { ...item, isResolving: false };
            }
          } catch (err) {
            console.error('Error resolving TOC dest:', err);
            updatedItems[itemIdx] = { ...item, isResolving: false };
          }
        })
      );

      // Update state for progressive loading
      setToc([...updatedItems]);
      
      // Yield to the browser main thread
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };

  // Smart history registration
  const registerViewpoint = (pageNumber: number, reason: 'jump' | 'read' | 'toc' | 'annotated' | 'scroll', panelId?: 'left' | 'right') => {
    if (reason === 'scroll') return; // Handled as normal browsing, don't spam history logs

    const now = Date.now();
    const lastPageVal = panelId ? lastLogPage.current[panelId] : 1;

    // Filter rules
    if (reason === 'read') {
      // Dwell time: avoid logging duplicate read logs for the same page consecutively
      const lastEntry = history[0];
      if (lastEntry && lastEntry.pageNumber === pageNumber && lastEntry.reason === 'read') {
        return;
      }
    } else if (reason === 'jump') {
      // Quick flip filters: skip if jump is small (<= 2 pages) and fast (< 2.5s)
      const pageDiff = Math.abs(pageNumber - lastPageVal);
      const timeDiff = now - lastLogTime.current;
      if (pageDiff <= 2 && timeDiff < 2500) {
        if (panelId) lastLogPage.current[panelId] = pageNumber;
        return;
      }
    }

    // Lookup section title from TOC
    let sectionName = '';
    const currentToc = tocRef.current;
    if (currentToc && currentToc.length > 0) {
      for (let i = currentToc.length - 1; i >= 0; i--) {
        if (currentToc[i].pageNumber <= pageNumber) {
          sectionName = currentToc[i].title;
          break;
        }
      }
    }

    const newEntry: HistoryEntry = {
      id: Math.random().toString(36).substring(2, 9),
      pageNumber,
      sectionName: sectionName || undefined,
      timestamp: now,
      reason: reason,
    };

    setHistory(prev => {
      const filtered = prev.filter(
        item => !(item.pageNumber === pageNumber && item.reason === newEntry.reason && now - item.timestamp < 10000)
      );
      const updated = [newEntry, ...filtered].slice(0, 30);
      if (pdfFilename) {
        localStorage.setItem(`aethelgard_history_${pdfFilename}`, JSON.stringify(updated));
      }
      return updated;
    });

    if (panelId) lastLogPage.current[panelId] = pageNumber;
    lastLogTime.current = now;
  };

  // Sync scroll & page updates between panels if linked
  const handlePageChange = (panelId: 'left' | 'right', pageNumber: number, reason: 'jump' | 'read' | 'toc' | 'annotated' | 'scroll' = 'jump') => {
    if (panelId === 'left') {
      setLeftPanel(prev => ({ ...prev, currentPage: pageNumber }));
      registerViewpoint(pageNumber, reason, 'left');
      if (linkedScrolling && reason !== 'scroll') {
        setRightPanel(prev => ({ ...prev, currentPage: Math.min(pdfDocument?.numPages || pageNumber, pageNumber + 1) }));
      }
    } else {
      setRightPanel(prev => ({ ...prev, currentPage: pageNumber }));
      registerViewpoint(pageNumber, reason, 'right');
      if (linkedScrolling && reason !== 'scroll') {
        setLeftPanel(prev => ({ ...prev, currentPage: Math.max(1, pageNumber - 1) }));
      }
    }
  };

  // Jump from TOC or Bookmark clicks
  const handleJumpToPage = async (pageNumber: number, tocItem?: TocItem) => {
    let targetPage = pageNumber;
    
    // If TOC item is still resolving, resolve it on demand
    if (tocItem && tocItem.isResolving && tocItem.dest && pdfDocument) {
      setLoading(true);
      try {
        let dest = tocItem.dest;
        if (typeof dest === 'string') {
          dest = await pdfDocument.getDestination(dest);
        }
        if (Array.isArray(dest)) {
          const destRef = dest[0];
          const pageIdx = await pdfDocument.getPageIndex(destRef);
          targetPage = pageIdx + 1;
          
          // Update the item in TOC so it shows page number and is marked resolved
          setToc(prev => prev.map(item => 
            item.title === tocItem.title && item.dest === tocItem.dest
              ? { ...item, pageNumber: targetPage, isResolving: false }
              : item
          ));
        }
      } catch (err) {
        console.error('Failed to resolve page number on demand:', err);
      } finally {
        setLoading(false);
      }
    }

    // Jump left panel to target page
    handlePageChange('left', targetPage, 'toc');
    // If split pane, jump right panel to next page
    if (layoutMode === 'split' && !linkedScrolling) {
      setRightPanel(prev => ({ ...prev, currentPage: Math.min(pdfDocument?.numPages || targetPage, targetPage + 1) }));
    }
  };

  // Manage Bookmarks
  const toggleBookmark = (pageNumber: number) => {
    if (!pdfFilename) return;
    const existing = bookmarks.find(b => b.pageNumber === pageNumber);
    if (existing) {
      const updated = bookmarks.filter(b => b.pageNumber !== pageNumber);
      setBookmarks(updated);
      localStorage.setItem(`aethelgard_bookmarks_${pdfFilename}`, JSON.stringify(updated));
      showToast(`Removed Bookmark for Page ${pageNumber}`);
    } else {
      setBookmarkModalPage(pageNumber);
      setBookmarkModalLabel(`Page ${pageNumber} - Note`);
      setBookmarkModalOpen(true);
    }
  };

  const handleSaveBookmark = () => {
    if (!pdfFilename) return;
    const newBookmark: Bookmark = {
      id: Math.random().toString(36).substring(2, 9),
      pageNumber: bookmarkModalPage,
      label: bookmarkModalLabel.trim() || `Page ${bookmarkModalPage}`,
      timestamp: Date.now(),
    };
    const updated = [...bookmarks, newBookmark];
    setBookmarks(updated);
    localStorage.setItem(`aethelgard_bookmarks_${pdfFilename}`, JSON.stringify(updated));
    setBookmarkModalOpen(false);
    showToast(`Added Bookmark: "${newBookmark.label}"`);
  };

  // Save Drawings
  const handleSaveDrawings = (pageNumber: number, strokes: Stroke[]) => {
    if (!pdfFilename) return;
    const updated = {
      ...drawingsRegistry,
      [pageNumber]: strokes,
    };
    setDrawingsRegistry(updated);
    localStorage.setItem(`aethelgard_drawings_${pdfFilename}`, JSON.stringify(updated));
  };

  // Clear drawings on currently focused panel's active page
  const handleClearCurrentPageDrawings = () => {
    const activePanelState = focusedPanel === 'left' ? leftPanel : rightPanel;
    const activePage = activePanelState.currentPage;
    
    if (window.confirm(`Clear all scribbles on Page ${activePage}?`)) {
      handleSaveDrawings(activePage, []);
      showToast(`Cleared Page ${activePage} drawings`);
    }
  };

  // Change Layout
  const toggleLayoutMode = (mode: 'single' | 'split') => {
    setLayoutMode(mode);
    localStorage.setItem('aethelgard_layout_mode', mode);
  };

  // Clear history
  const handleClearHistory = () => {
    if (window.confirm('Clear all reading history?')) {
      setHistory([]);
      localStorage.removeItem('aethelgard_history');
      showToast('History cleared.');
    }
  };

  // Import/Export Data
  const exportData = () => {
    if (!pdfFilename) return;
    const data = {
      drawings: drawingsRegistry,
      bookmarks: bookmarks,
      history: history,
      scratchpad: localStorage.getItem('aethelgard_scratchpad_strokes') 
        ? JSON.parse(localStorage.getItem('aethelgard_scratchpad_strokes')!) 
        : []
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `aethelgard_backup_${pdfFilename.replace(/\.pdf$/i, '')}_${new Date().toISOString().slice(0, 10)}.json`;
    link.href = url;
    link.click();
    showToast('Reading data exported!');
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.drawings && pdfFilename) {
          setDrawingsRegistry(data.drawings);
          localStorage.setItem(`aethelgard_drawings_${pdfFilename}`, JSON.stringify(data.drawings));
        }
        if (data.bookmarks && pdfFilename) {
          setBookmarks(data.bookmarks);
          localStorage.setItem(`aethelgard_bookmarks_${pdfFilename}`, JSON.stringify(data.bookmarks));
        }
        if (data.history && pdfFilename) {
          setHistory(data.history);
          localStorage.setItem(`aethelgard_history_${pdfFilename}`, JSON.stringify(data.history));
        }
        if (data.scratchpad) {
          localStorage.setItem('aethelgard_scratchpad_strokes', JSON.stringify(data.scratchpad));
        }
        showToast('Data imported successfully!');
        window.location.reload();
      } catch (err) {
        alert('Failed to parse JSON backup file.');
      }
    };
    reader.readAsText(file);
  };

  if (initCheckingDb) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)'
      }}>
        <div style={{
          width: '30px',
          height: '30px',
          border: '2px solid var(--border-light)',
          borderTopColor: 'var(--accent-primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '15px'
        }}></div>
        <span style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>RESTORING SESSION...</span>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!pdfDocument) {
    return (
      <WelcomeScreen 
        onFileSelect={loadFile} 
        error={error} 
        loading={loading}
      />
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toast Notification */}
      {toastMessage && <div className="notification-toast">{toastMessage}</div>}

      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          <button 
            className="panel-btn" 
            title="Toggle Sidebar" 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <Menu size={18} />
          </button>
          <div className="logo-text">AETHELGARD</div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '2px' }}>READER</span>
        </div>

        <div className="header-controls">
          {/* Active PDF Filename */}
          {pdfFilename && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BookOpen size={13} style={{ color: 'var(--accent-primary)' }} />
                <span style={{ 
                  fontWeight: 500, 
                  color: 'var(--text-primary)', 
                  maxWidth: '180px', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap' 
                }}>
                  {pdfFilename}
                </span>
              </span>
              <button 
                onClick={closeDocument}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.2s',
                }}
                title="Close Document"
                onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="toolbar-divider"></div>

          {/* Layout togglers */}
          <button 
            className={`header-btn ${layoutMode === 'single' ? 'active' : ''}`}
            onClick={() => toggleLayoutMode('single')}
            title="Single Pane Mode"
          >
            <Square size={13} /> Single View
          </button>
          <button 
            className={`header-btn ${layoutMode === 'split' ? 'active' : ''}`}
            onClick={() => toggleLayoutMode('split')}
            title="Dual Split Pane Mode"
          >
            <Columns size={13} /> Split View
          </button>

          <div className="toolbar-divider"></div>

          {/* Sync mode toggler */}
          <button 
            className={`header-btn ${linkedScrolling ? 'active' : ''}`}
            onClick={() => setLinkedScrolling(!linkedScrolling)}
            title="Link panels to scroll page offsets together"
          >
            {linkedScrolling ? <LinkIcon size={13} /> : <Link2Off size={13} />}
            {linkedScrolling ? 'Pages Linked' : 'Pages Unlinked'}
          </button>

          <div className="toolbar-divider"></div>

          {/* Fullscreen toggler */}
          <button 
            className={`header-btn ${isFullscreen ? 'active' : ''}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>

          <div className="toolbar-divider"></div>

          {/* Data backups */}
          <button className="header-btn" title="Export scribbles & bookmarks" onClick={exportData}>
            <Download size={13} /> Export Backup
          </button>
          <label className="header-btn" title="Import backups" style={{ cursor: 'pointer' }}>
            <Upload size={13} /> Import Backup
            <input 
              type="file" 
              accept=".json" 
              onChange={importData} 
              style={{ display: 'none' }} 
            />
          </label>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="app-container">
        {/* Sidebar */}
        <Sidebar
          toc={toc}
          bookmarks={bookmarks}
          history={history}
          onJumpToPage={handleJumpToPage}
          activeTab={activeSidebarTab}
          setActiveTab={setActiveSidebarTab}
          collapsed={sidebarCollapsed}
          onClearHistory={handleClearHistory}
        />

        {/* Viewing workspace */}
        <div className="workspace-container">
          {loading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(9,10,15,0.7)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 500,
            }}>
              <div style={{
                width: '30px',
                height: '30px',
                border: '2px solid var(--border-light)',
                borderTopColor: 'var(--accent-primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <span style={{ marginTop: '15px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Resolving document outline...
              </span>
              <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
              `}</style>
            </div>
          )}

          {error && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: '#141517',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 500,
              padding: '20px',
              textAlign: 'center',
            }}>
              <div style={{ color: '#ef4444', fontSize: '1.1rem', fontWeight: 600, marginBottom: '10px' }}>
                Error Loading PDF
              </div>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', fontSize: '0.8rem', marginBottom: '20px' }}>
                {error}
              </p>
              <button className="header-btn" onClick={() => window.location.reload()}>
                Try Reload
              </button>
            </div>
          )}

          {/* Left Panel */}
          {leftPanel.mode === 'pdf' ? (
            <PDFViewer
              panelId="left"
              pdfDocument={pdfDocument}
              currentPage={leftPanel.currentPage}
              zoom={globalZoom}
              onPageChange={(page, reason) => handlePageChange('left', page, reason)}
              onZoomChange={setGlobalZoom}
              drawingsRegistry={drawingsRegistry}
              onSaveDrawings={handleSaveDrawings}
              tool={activeTool}
              color={activeColor}
              brushSize={brushSize}
              colorMap={COLOR_MAP}
              isBookmarked={bookmarks.some(b => b.pageNumber === leftPanel.currentPage)}
              onToggleBookmark={() => toggleBookmark(leftPanel.currentPage)}
              registerViewpoint={(page, reason) => registerViewpoint(page, reason, 'left')}
              onSwitchToWhiteboard={() => setLeftPanel(prev => ({ ...prev, mode: 'whiteboard' }))}
              onFocusPanel={() => setFocusedPanel('left')}
            />
          ) : (
            <div className="viewer-panel" onClick={() => setFocusedPanel('left')}>
              <Whiteboard
                tool={activeTool}
                color={activeColor}
                brushSize={brushSize}
                colorMap={COLOR_MAP}
              />
              <button
                className="header-btn"
                style={{ position: 'absolute', top: '10px', right: '180px', zIndex: 100 }}
                onClick={() => setLeftPanel(prev => ({ ...prev, mode: 'pdf' }))}
              >
                <BookOpen size={13} /> Back to PDF
              </button>
            </div>
          )}

          {/* Right Panel (Only in split mode) */}
          {layoutMode === 'split' && (
            rightPanel.mode === 'pdf' ? (
              <PDFViewer
                panelId="right"
                pdfDocument={pdfDocument}
                currentPage={rightPanel.currentPage}
                zoom={globalZoom}
                onPageChange={(page, reason) => handlePageChange('right', page, reason)}
                onZoomChange={setGlobalZoom}
                drawingsRegistry={drawingsRegistry}
                onSaveDrawings={handleSaveDrawings}
                tool={activeTool}
                color={activeColor}
                brushSize={brushSize}
                colorMap={COLOR_MAP}
                isBookmarked={bookmarks.some(b => b.pageNumber === rightPanel.currentPage)}
                onToggleBookmark={() => toggleBookmark(rightPanel.currentPage)}
                registerViewpoint={(page, reason) => registerViewpoint(page, reason, 'right')}
                onSwitchToWhiteboard={() => setRightPanel(prev => ({ ...prev, mode: 'whiteboard' }))}
                onFocusPanel={() => setFocusedPanel('right')}
              />
            ) : (
              <div className="viewer-panel" onClick={() => setFocusedPanel('right')}>
                <Whiteboard
                  tool={activeTool}
                  color={activeColor}
                  brushSize={brushSize}
                  colorMap={COLOR_MAP}
                />
                <button
                  className="header-btn"
                  style={{ position: 'absolute', top: '10px', right: '180px', zIndex: 100 }}
                  onClick={() => setRightPanel(prev => ({ ...prev, mode: 'pdf' }))}
                >
                  <BookOpen size={13} /> Back to PDF
                </button>
              </div>
            )
          )}

          {/* Shared Floating Drawing Toolbar at Left */}
          <div className="drawing-toolbar">
            
            {/* Tool picker */}
            <div className="tool-group">
              <button 
                className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
                onClick={() => setActiveTool('select')}
                title="Mouse Cursor (Text selection/navigation)"
              >
                <MousePointer size={13} />
              </button>
              <button 
                className={`tool-btn ${activeTool === 'pencil' ? 'active' : ''}`}
                onClick={() => setActiveTool('pencil')}
                title="Pencil Drawing"
              >
                <PenTool size={13} />
              </button>
              <button 
                className={`tool-btn ${activeTool === 'highlighter' ? 'active' : ''}`}
                onClick={() => setActiveTool('highlighter')}
                title="Highlighter Tool"
              >
                <Highlighter size={13} />
              </button>
              <button 
                className={`tool-btn ${activeTool === 'eraser' ? 'active' : ''}`}
                onClick={() => setActiveTool('eraser')}
                title="Eraser (Erase strokes)"
              >
                <Eraser size={13} />
              </button>
            </div>

            <div className="toolbar-divider"></div>

            {/* Colors picker */}
            <div className="tool-group">
              {(Object.keys(COLOR_MAP) as DrawingColor[]).map((col) => (
                <div
                  key={col}
                  className={`color-dot ${col} ${activeColor === col ? 'active' : ''}`}
                  onClick={() => setActiveColor(col)}
                  title={`Color: ${col}`}
                />
              ))}
            </div>

            <div className="toolbar-divider"></div>

            {/* Brush sizes picker */}
            <div className="brush-size-select" title="Brush Thickness">
              <div 
                className={`brush-dot ${brushSize === 2 ? 'active' : ''}`}
                style={{ width: '4px', height: '4px' }}
                onClick={() => setBrushSize(2)}
              />
              <div 
                className={`brush-dot ${brushSize === 5 ? 'active' : ''}`}
                style={{ width: '7px', height: '7px' }}
                onClick={() => setBrushSize(5)}
              />
              <div 
                className={`brush-dot ${brushSize === 10 ? 'active' : ''}`}
                style={{ width: '10px', height: '10px' }}
                onClick={() => setBrushSize(10)}
              />
              <div 
                className={`brush-dot ${brushSize === 18 ? 'active' : ''}`}
                style={{ width: '13px', height: '13px' }}
                onClick={() => setBrushSize(18)}
              />
            </div>

            <div className="toolbar-divider"></div>

            {/* Clear active page scribbles */}
            <button
              className="tool-btn"
              onClick={handleClearCurrentPageDrawings}
              title={`Clear all scribbles on Page ${focusedPanel === 'left' ? leftPanel.currentPage : rightPanel.currentPage}`}
              style={{ color: '#c97b70' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Bookmark Naming Modal */}
      {bookmarkModalOpen && (
        <div className="bookmark-modal-overlay">
          <div className="bookmark-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div className="bookmark-modal-title">Name Your Bookmark</div>
              <button 
                className="panel-btn" 
                onClick={() => setBookmarkModalOpen(false)}
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={15} />
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Add a label for Page {bookmarkModalPage}:
            </p>
            <input
              type="text"
              className="bookmark-input"
              value={bookmarkModalLabel}
              onChange={(e) => setBookmarkModalLabel(e.target.value)}
              placeholder="e.g. Section 4 Proof"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSaveBookmark()}
            />
            <div className="bookmark-modal-buttons">
              <button className="bookmark-btn-cancel" onClick={() => setBookmarkModalOpen(false)}>
                Cancel
              </button>
              <button className="bookmark-btn-save" onClick={handleSaveBookmark}>
                Save Bookmark
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface WelcomeScreenProps {
  onFileSelect: (file: File) => void;
  error: string | null;
  loading: boolean;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onFileSelect, error, loading }) => {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith('.pdf')) {
        onFileSelect(file);
      } else {
        alert("Please drop a valid PDF file.");
      }
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-app)',
      padding: '20px',
      fontFamily: 'var(--font-sans)',
    }}>
      <div 
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        style={{
          maxWidth: '520px',
          width: '100%',
          background: 'var(--bg-sidebar)',
          border: dragActive ? '2px dashed var(--accent-primary)' : '1px solid var(--border-light)',
          borderRadius: '16px',
          padding: '40px 30px',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          transform: dragActive ? 'scale(1.02)' : 'scale(1)',
        }}
      >
        <div style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '2rem',
          fontWeight: 700,
          background: 'var(--accent-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '4px',
          marginBottom: '4px',
        }}>
          AETHELGARD
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          marginBottom: '32px',
        }}>
          Minimalist Offline Reader
        </div>

        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'rgba(133, 150, 129, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          border: '1px solid rgba(133, 150, 129, 0.15)',
        }}>
          <Upload size={28} style={{ color: 'var(--accent-primary)' }} />
        </div>

        <p style={{
          fontSize: '0.9rem',
          color: 'var(--text-primary)',
          lineHeight: '1.6',
          marginBottom: '8px',
          fontWeight: 500,
        }}>
          Drag and drop a PDF file here
        </p>
        <p style={{
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          lineHeight: '1.5',
          marginBottom: '28px',
          maxWidth: '320px',
        }}>
          Your file is cached locally in browser IndexedDB. No server uploads.
        </p>

        <input 
          ref={fileInputRef}
          type="file" 
          accept=".pdf" 
          onChange={handleChange} 
          style={{ display: 'none' }}
        />

        <button 
          onClick={handleButtonClick}
          disabled={loading}
          style={{
            background: 'var(--accent-gradient)',
            border: 'none',
            borderRadius: '8px',
            color: '#141517',
            padding: '12px 28px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(133, 150, 129, 0.25)',
            transition: 'transform 0.2s, box-shadow 0.2s',
            outline: 'none',
          }}
        >
          {loading ? 'Reading document...' : 'Choose File'}
        </button>

        {error && (
          <div style={{
            marginTop: '20px',
            padding: '10px 16px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#ef4444',
            fontSize: '0.75rem',
            maxWidth: '100%',
            wordBreak: 'break-all',
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
