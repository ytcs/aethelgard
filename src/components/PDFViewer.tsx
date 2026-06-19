import React, { useRef, useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Stroke, DrawingTool, DrawingColor, BrushSize, PageDrawingsRegistry } from '../types';
import { PDFPageRender } from './PDFPageRender';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Bookmark, 
  BookmarkCheck,
  FileText
} from 'lucide-react';

interface PDFViewerProps {
  panelId: 'left' | 'right';
  pdfDocument: pdfjsLib.PDFDocumentProxy | null;
  currentPage: number;
  zoom: number;
  onPageChange: (pageNumber: number, reason: 'jump' | 'read' | 'toc' | 'annotated' | 'scroll') => void;
  onZoomChange: (zoom: number) => void;
  drawingsRegistry: PageDrawingsRegistry;
  onSaveDrawings: (pageNumber: number, strokes: Stroke[]) => void;
  tool: DrawingTool;
  color: DrawingColor;
  brushSize: BrushSize;
  colorMap: Record<DrawingColor, string>;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  registerViewpoint: (page: number, reason: 'jump' | 'read' | 'toc' | 'annotated') => void;
  onSwitchToWhiteboard: () => void;
  onFocusPanel: () => void;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
  panelId,
  pdfDocument,
  currentPage,
  zoom,
  onPageChange,
  onZoomChange,
  drawingsRegistry,
  onSaveDrawings,
  tool,
  color,
  brushSize,
  colorMap,
  isBookmarked,
  onToggleBookmark,
  registerViewpoint,
  onSwitchToWhiteboard,
  onFocusPanel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const isScrollingToPageRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<any>(null);
  const lastScrolledPageRef = useRef<number>(1);
  const isInitRef = useRef<boolean>(true);
  
  const [numPages, setNumPages] = useState<number>(0);
  const [renderedPages, setRenderedPages] = useState<Record<number, boolean>>({});
  const [pageWidth, setPageWidth] = useState<number>(600);
  const [pageHeight, setPageHeight] = useState<number>(840);
  const [aspectRatio, setAspectRatio] = useState<number>(1.414);
  const dwellTimerRef = useRef<any>(null);

  // Set total pages
  useEffect(() => {
    if (pdfDocument) {
      setNumPages(pdfDocument.numPages);
    }
  }, [pdfDocument]);

  // Set up Dwell timer when active page changes
  useEffect(() => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
    }

    dwellTimerRef.current = setTimeout(() => {
      registerViewpoint(currentPage, 'read');
    }, 5000);

    return () => {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
      }
    };
  }, [currentPage]);

  // Measure container and perform Fit-to-Width default zoom calculation
  useEffect(() => {
    const initDimensions = async () => {
      if (!pdfDocument || !containerRef.current) return;
      try {
        const firstPage = await pdfDocument.getPage(1);
        const baseViewport = firstPage.getViewport({ scale: 1.0 });
        const ratio = baseViewport.height / baseViewport.width;
        setAspectRatio(ratio);

        // Fit to width: container width minus padding (40px)
        const containerWidth = containerRef.current.clientWidth - 40;
        const fitScale = containerWidth / baseViewport.width;
        
        onZoomChange(fitScale);
        setPageWidth(containerWidth);
        setPageHeight(containerWidth * ratio);
      } catch (err) {
        console.error('Failed to initialize dimensions:', err);
      }
    };

    initDimensions();
  }, [pdfDocument]);

  // Recalculate dimensions when zoom changes
  useEffect(() => {
    if (!pdfDocument) return;
    const calculateSizes = async () => {
      try {
        const firstPage = await pdfDocument.getPage(1);
        const baseViewport = firstPage.getViewport({ scale: 1.0 });
        const calculatedWidth = baseViewport.width * zoom;
        setPageWidth(calculatedWidth);
        setPageHeight(calculatedWidth * aspectRatio);
      } catch (err) {
        console.error(err);
      }
    };
    calculateSizes();
  }, [zoom, aspectRatio, pdfDocument]);

  // Reset refs when pdfDocument changes to handle fresh document loading cleanly
  useEffect(() => {
    isInitRef.current = true;
    lastScrolledPageRef.current = currentPage;
  }, [pdfDocument]);

  // Clear cache and trigger redraw of rendered pages when zoom factor or document changes
  useEffect(() => {
    setRenderedPages({});
  }, [zoom, pdfDocument]);

  // Scroll to active page when explicitly changed by external inputs or on initial mount
  useEffect(() => {
    const scrollToPage = () => {
      const pageEl = pageRefs.current[currentPage];
      if (pageEl && containerRef.current) {
        isScrollingToPageRef.current = true;
        pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });
        lastScrolledPageRef.current = currentPage;
        
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          isScrollingToPageRef.current = false;
        }, 200);
      }
    };

    if (numPages > 0) {
      const isInitial = isInitRef.current;
      const isExplicitJump = currentPage !== lastScrolledPageRef.current;

      if (isInitial || isExplicitJump) {
        // Run with a slight timeout to ensure DOM layout has fully completed
        const timer = setTimeout(scrollToPage, 100);
        if (isInitial) {
          isInitRef.current = false;
        }
        return () => clearTimeout(timer);
      }
    }
  }, [currentPage, numPages, pdfDocument]);

  // Setup page intersection observer to mount canvases dynamically (Caches Rendered Canvases)
  useEffect(() => {
    if (!pdfDocument || numPages === 0 || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setRenderedPages((prev) => {
          let updated = prev;
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const pNum = Number(entry.target.getAttribute('data-page'));
              if (!prev[pNum]) {
                if (updated === prev) updated = { ...prev };
                updated[pNum] = true; // Cache: once true, stays true in this zoom session!
              }
            }
          });
          return updated;
        });
      },
      {
        root: containerRef.current,
        rootMargin: '400px 0px 400px 0px', // Preloads pages 400px before scroll for seamless load
        threshold: 0.01,
      }
    );

    const currentRefs = pageRefs.current;
    for (let p = 1; p <= numPages; p++) {
      const ref = currentRefs[p];
      if (ref) observer.observe(ref);
    }

    return () => {
      for (let p = 1; p <= numPages; p++) {
        const ref = currentRefs[p];
        if (ref) observer.unobserve(ref);
      }
      observer.disconnect();
    };
  }, [pdfDocument, numPages]);

  // Setup active page scroll tracking observer (observes center of viewport)
  useEffect(() => {
    if (!pdfDocument || numPages === 0 || !containerRef.current) return;

    const activePageObserver = new IntersectionObserver(
      (entries) => {
        if (isScrollingToPageRef.current || isInitRef.current) return;

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pNum = Number(entry.target.getAttribute('data-page'));
            lastScrolledPageRef.current = pNum; // Log scroll event target
            onPageChange(pNum, 'scroll');
          }
        });
      },
      {
        root: containerRef.current,
        rootMargin: '-45% 0px -45% 0px',
        threshold: 0,
      }
    );

    const currentRefs = pageRefs.current;
    for (let p = 1; p <= numPages; p++) {
      const ref = currentRefs[p];
      if (ref) activePageObserver.observe(ref);
    }

    return () => {
      for (let p = 1; p <= numPages; p++) {
        const ref = currentRefs[p];
        if (ref) activePageObserver.unobserve(ref);
      }
      activePageObserver.disconnect();
    };
  }, [pdfDocument, numPages]);

  // Navigation handlers
  const handlePageInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = parseInt(e.currentTarget.value);
      if (!isNaN(val) && val >= 1 && val <= numPages) {
        onPageChange(val, 'jump');
      } else {
        e.currentTarget.value = currentPage.toString();
      }
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1, 'jump');
    }
  };

  const handleNextPage = () => {
    if (currentPage < numPages) {
      onPageChange(currentPage + 1, 'jump');
    }
  };

  // Generate page list elements
  const renderPagesStack = () => {
    const list = [];
    for (let p = 1; p <= numPages; p++) {
      list.push(
        <div
          key={p}
          ref={(el) => {
            pageRefs.current[p] = el;
          }}
          data-page={p}
          className="pdf-page-container"
          style={{
            width: `${pageWidth}px`,
            height: `${pageHeight}px`,
            marginBottom: '15px',
            backgroundColor: '#ffffff',
          }}
        >
          {renderedPages[p] && pdfDocument && (
            <PDFPageRender
              pdfDocument={pdfDocument}
              pageNumber={p}
              width={pageWidth}
              height={pageHeight}
              drawings={drawingsRegistry[p] || []}
              onSaveDrawings={(strokes) => onSaveDrawings(p, strokes)}
              tool={tool}
              color={color}
              brushSize={brushSize}
              colorMap={colorMap}
              onDrawStart={() => registerViewpoint(p, 'annotated')}
              onPanelFocus={onFocusPanel}
              onJumpToPage={(targetPage) => onPageChange(targetPage, 'jump')}
            />
          )}
        </div>
      );
    }
    return list;
  };

  return (
    <div className="viewer-panel" onClick={onFocusPanel}>
      <div className="panel-header">
        <div className="panel-title">
          <span>Panel {panelId === 'left' ? 'A' : 'B'} — Page {currentPage} of {numPages}</span>
        </div>
        
        <div className="panel-controls">
          {/* Zoom Actions */}
          <button className="panel-btn" title="Zoom Out" onClick={() => onZoomChange(Math.max(0.5, zoom - 0.15))}>
            <ZoomOut size={15} />
          </button>
          <span style={{ fontSize: '0.75rem', minWidth: '35px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button className="panel-btn" title="Zoom In" onClick={() => onZoomChange(Math.min(3.0, zoom + 0.15))}>
            <ZoomIn size={15} />
          </button>
          
          <div className="toolbar-divider" style={{ height: '16px' }}></div>
          
          {/* Page Jumper */}
          <div className="page-nav-container">
            <button 
              className="panel-btn" 
              onClick={handlePrevPage} 
              disabled={currentPage <= 1}
              style={{ opacity: currentPage <= 1 ? 0.3 : 1 }}
            >
              <ChevronLeft size={15} />
            </button>
            <input
              type="text"
              className="page-input"
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1 && val <= numPages) {
                  onPageChange(val, 'jump');
                }
              }}
              key={`${panelId}-${currentPage}`}
              onKeyDown={handlePageInput}
              onBlur={(e) => e.target.value = currentPage.toString()}
            />
            <span style={{ color: 'var(--text-secondary)' }}>/ {numPages}</span>
            <button 
              className="panel-btn" 
              onClick={handleNextPage} 
              disabled={currentPage >= numPages}
              style={{ opacity: currentPage >= numPages ? 0.3 : 1 }}
            >
              <ChevronRight size={15} />
            </button>
          </div>
          
          <div className="toolbar-divider" style={{ height: '16px' }}></div>

          {/* Bookmarking */}
          <button 
            className="panel-btn" 
            title={isBookmarked ? "Remove Bookmark" : "Add Bookmark"} 
            onClick={onToggleBookmark}
            style={{ color: isBookmarked ? 'var(--accent-secondary)' : 'inherit' }}
          >
            {isBookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          </button>

          <div className="toolbar-divider" style={{ height: '16px' }}></div>
          
          {/* Whiteboard trigger */}
          <button
            className="panel-btn"
            title="Switch to Scratchpad Whiteboard"
            onClick={onSwitchToWhiteboard}
          >
            <FileText size={15} />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="panel-viewport" style={{ overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {pdfDocument ? renderPagesStack() : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '100px' }}>
              No document loaded
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
