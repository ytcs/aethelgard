import { useState, useEffect, useRef } from 'react';
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
  MousePointer
} from 'lucide-react';

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
  
  // Document loading
  const [pdfPath, setPdfPath] = useState('/mfg/main.pdf');
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Load persistence registries on mount
  useEffect(() => {
    const savedDrawings = localStorage.getItem('aethelgard_drawings');
    const savedBookmarks = localStorage.getItem('aethelgard_bookmarks');
    const savedHistory = localStorage.getItem('aethelgard_history');
    
    if (savedDrawings) {
      try { setDrawingsRegistry(JSON.parse(savedDrawings)); } catch(e) { console.error(e); }
    }
    if (savedBookmarks) {
      try { setBookmarks(JSON.parse(savedBookmarks)); } catch(e) { console.error(e); }
    }
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch(e) { console.error(e); }
    }

    // Restore reader session positions
    const savedSession = localStorage.getItem('aethelgard_reader_session');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        if (session.pdfPath) setPdfPath(session.pdfPath);
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
    }
  }, []);

  // Save session state to localStorage
  useEffect(() => {
    if (!pdfDocument) return; // Prevent overwriting on initial boot
    const session = {
      pdfPath,
      layoutMode,
      linkedScrolling,
      globalZoom,
      leftPage: leftPanel.currentPage,
      rightPage: rightPanel.currentPage,
      sidebarCollapsed,
      activeSidebarTab,
    };
    localStorage.setItem('aethelgard_reader_session', JSON.stringify(session));
  }, [pdfPath, layoutMode, linkedScrolling, globalZoom, leftPanel.currentPage, rightPanel.currentPage, sidebarCollapsed, activeSidebarTab, pdfDocument]);

  // Load PDF Document when path changes
  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      setPdfDocument(null);
      setToc([]);

      try {
        const loadingTask = pdfjsLib.getDocument({ url: pdfPath });
        const doc = await loadingTask.promise;
        setPdfDocument(doc);
        showToast('PDF loaded successfully!');

        // Extract TOC (Outline)
        const flatOutline = await extractToc(doc);
        setToc(flatOutline);
      } catch (err: any) {
        console.error('Failed to load PDF:', err);
        setError(`Failed to load PDF document: ${err.message || err.toString()}`);
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [pdfPath]);

  // Extract outline items recursively
  const extractToc = async (pdf: pdfjsLib.PDFDocumentProxy): Promise<TocItem[]> => {
    try {
      const outline = await pdf.getOutline();
      if (!outline) return [];
      
      const flatOutline: TocItem[] = [];
      const traverse = async (items: any[], level: number) => {
        for (const item of items) {
          let pageNumber = 1;
          if (item.dest) {
            try {
              let dest = item.dest;
              if (typeof dest === 'string') {
                dest = await pdf.getDestination(dest);
              }
              if (Array.isArray(dest)) {
                const destRef = dest[0];
                const pageIdx = await pdf.getPageIndex(destRef);
                pageNumber = pageIdx + 1;
              }
            } catch (err) {
              console.error('Error resolving TOC dest:', err);
            }
          }
          flatOutline.push({
            title: item.title,
            pageNumber,
            level,
          });
          if (item.items && item.items.length > 0) {
            await traverse(item.items, level + 1);
          }
        }
      };
      await traverse(outline, 1);
      return flatOutline;
    } catch (e) {
      console.error('Error loading outline:', e);
      return [];
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
      localStorage.setItem('aethelgard_history', JSON.stringify(updated));
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
  const handleJumpToPage = (pageNumber: number) => {
    // Jump left panel to target page
    handlePageChange('left', pageNumber, 'toc');
    // If split pane, jump right panel to next page
    if (layoutMode === 'split' && !linkedScrolling) {
      setRightPanel(prev => ({ ...prev, currentPage: Math.min(pdfDocument?.numPages || pageNumber, pageNumber + 1) }));
    }
  };

  // Manage Bookmarks
  const toggleBookmark = (pageNumber: number) => {
    const existing = bookmarks.find(b => b.pageNumber === pageNumber);
    if (existing) {
      const updated = bookmarks.filter(b => b.pageNumber !== pageNumber);
      setBookmarks(updated);
      localStorage.setItem('aethelgard_bookmarks', JSON.stringify(updated));
      showToast(`Removed Bookmark for Page ${pageNumber}`);
    } else {
      setBookmarkModalPage(pageNumber);
      setBookmarkModalLabel(`Page ${pageNumber} - Note`);
      setBookmarkModalOpen(true);
    }
  };

  const handleSaveBookmark = () => {
    const newBookmark: Bookmark = {
      id: Math.random().toString(36).substring(2, 9),
      pageNumber: bookmarkModalPage,
      label: bookmarkModalLabel.trim() || `Page ${bookmarkModalPage}`,
      timestamp: Date.now(),
    };
    const updated = [...bookmarks, newBookmark];
    setBookmarks(updated);
    localStorage.setItem('aethelgard_bookmarks', JSON.stringify(updated));
    setBookmarkModalOpen(false);
    showToast(`Added Bookmark: "${newBookmark.label}"`);
  };

  // Save Drawings
  const handleSaveDrawings = (pageNumber: number, strokes: Stroke[]) => {
    const updated = {
      ...drawingsRegistry,
      [pageNumber]: strokes,
    };
    setDrawingsRegistry(updated);
    localStorage.setItem('aethelgard_drawings', JSON.stringify(updated));
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
    link.download = `aethelgard_reader_backup_${new Date().toISOString().slice(0, 10)}.json`;
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
        if (data.drawings) {
          setDrawingsRegistry(data.drawings);
          localStorage.setItem('aethelgard_drawings', JSON.stringify(data.drawings));
        }
        if (data.bookmarks) {
          setBookmarks(data.bookmarks);
          localStorage.setItem('aethelgard_bookmarks', JSON.stringify(data.bookmarks));
        }
        if (data.history) {
          setHistory(data.history);
          localStorage.setItem('aethelgard_history', JSON.stringify(data.history));
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
          {/* PDF Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Book:</span>
            <select
              value={pdfPath}
              onChange={(e) => setPdfPath(e.target.value)}
              style={{
                background: 'var(--bg-panel)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.8rem',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <option value="/mfg/main.pdf">mfg/main.pdf (Current book)</option>
            </select>
          </div>

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

          {/* Shared Floating Drawing Toolbar at Bottom */}
          <div className="drawing-toolbar">
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '1px' }}>SCRIBBLE:</span>
            
            {/* Tool picker */}
            <div className="tool-group">
              <button 
                className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
                onClick={() => setActiveTool('select')}
                title="Mouse Cursor (Text selection/navigation)"
              >
                <MousePointer size={15} />
              </button>
              <button 
                className={`tool-btn ${activeTool === 'pencil' ? 'active' : ''}`}
                onClick={() => setActiveTool('pencil')}
                title="Pencil Drawing"
              >
                <PenTool size={15} />
              </button>
              <button 
                className={`tool-btn ${activeTool === 'highlighter' ? 'active' : ''}`}
                onClick={() => setActiveTool('highlighter')}
                title="Highlighter Tool"
              >
                <Highlighter size={15} />
              </button>
              <button 
                className={`tool-btn ${activeTool === 'eraser' ? 'active' : ''}`}
                onClick={() => setActiveTool('eraser')}
                title="Eraser (Erase strokes)"
              >
                <Eraser size={15} />
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
                style={{ width: '5px', height: '5px' }}
                onClick={() => setBrushSize(2)}
              />
              <div 
                className={`brush-dot ${brushSize === 5 ? 'active' : ''}`}
                style={{ width: '8px', height: '8px' }}
                onClick={() => setBrushSize(5)}
              />
              <div 
                className={`brush-dot ${brushSize === 10 ? 'active' : ''}`}
                style={{ width: '11px', height: '11px' }}
                onClick={() => setBrushSize(10)}
              />
              <div 
                className={`brush-dot ${brushSize === 18 ? 'active' : ''}`}
                style={{ width: '14px', height: '14px' }}
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
              <Trash2 size={15} />
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
