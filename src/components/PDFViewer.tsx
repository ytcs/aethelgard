import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
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
  FileText,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';

// Stable reference for pages with no drawings, so PDFPageRender's draw effect
// (keyed on the drawings array) doesn't re-run for blank pages on every render.
const EMPTY_STROKES: Stroke[] = [];

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
  registerViewpoint: (pageNumber: number, reason: 'jump' | 'read' | 'toc' | 'annotated' | 'scroll') => void;
  onSwitchToWhiteboard: () => void;
  onFocusPanel: () => void;
  // History navigation props
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  isFocused: boolean;
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
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  isFocused,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const isScrollingToPageRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<any>(null);
  const lastScrolledPageRef = useRef<number>(1);
  const isInitRef = useRef<boolean>(true);
  
  const basePageWidthRef = useRef<number>(600);
  const scrollRatioRef = useRef<number | null>(null);
  const isFirstDimensionsReadyRef = useRef<boolean>(true);

  // Keep a live ref to onPageChange so the scroll listener never goes stale and
  // we don't have to re-subscribe it on every parent render.
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  const [numPages, setNumPages] = useState<number>(0);
  const [renderedPages, setRenderedPages] = useState<Record<number, boolean>>({});
  const [pageWidth, setPageWidth] = useState<number>(600);
  const [pageHeight, setPageHeight] = useState<number>(840);
  const [aspectRatio, setAspectRatio] = useState<number>(1.414);
  const dwellTimerRef = useRef<any>(null);
  const [dimensionsReady, setDimensionsReady] = useState<boolean>(false);

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
        basePageWidthRef.current = baseViewport.width;

        // Fit to width: container width minus padding (40px)
        const containerWidth = containerRef.current.clientWidth - 40;
        const fitScale = containerWidth / baseViewport.width;
        
        onZoomChange(fitScale);
        setPageWidth(containerWidth);
        setPageHeight(containerWidth * ratio);
        setDimensionsReady(true);
      } catch (err) {
        console.error('Failed to initialize dimensions:', err);
      }
    };

    setDimensionsReady(false);
    initDimensions();
  }, [pdfDocument]);

  // Recalculate dimensions and capture scroll ratio when zoom changes
  useLayoutEffect(() => {
    if (!pdfDocument || !containerRef.current || !dimensionsReady) return;
    
    // 1. Capture current scroll ratio centered around viewport center before updating page sizes
    const container = containerRef.current;
    if (isFirstDimensionsReadyRef.current) {
      isFirstDimensionsReadyRef.current = false;
    } else {
      const center = container.scrollTop + container.clientHeight / 2;
      const ratio = center / container.scrollHeight;
      scrollRatioRef.current = ratio;
    }

    // 2. Calculate and set new page sizes
    const calculatedWidth = basePageWidthRef.current * zoom;
    setPageWidth(calculatedWidth);
    setPageHeight(calculatedWidth * aspectRatio);
  }, [zoom, aspectRatio, pdfDocument, dimensionsReady]);

  // Apply scroll ratio after layout shift occurs from pageHeight change
  useLayoutEffect(() => {
    if (scrollRatioRef.current !== null && containerRef.current && dimensionsReady) {
      const container = containerRef.current;
      isScrollingToPageRef.current = true;
      
      const newScrollTop = scrollRatioRef.current * container.scrollHeight - container.clientHeight / 2;
      container.scrollTop = Math.max(0, newScrollTop);
      scrollRatioRef.current = null;

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingToPageRef.current = false;
      }, 150);
    }
  }, [pageHeight, dimensionsReady]);

  // Reset refs when pdfDocument changes to handle fresh document loading cleanly
  useEffect(() => {
    isInitRef.current = true;
    isFirstDimensionsReadyRef.current = true;
    lastScrolledPageRef.current = currentPage;
  }, [pdfDocument]);

  // Reset the rendered-page cache only when the document changes. We must NOT
  // clear it on zoom: doing so unmounts every visible PDFPageRender, and the
  // IntersectionObserver won't re-mount pages that are already intersecting
  // (it only fires on intersection *changes*), leaving them blank until the
  // user scrolls them out and back. PDFPageRender already re-renders its
  // canvas at the new resolution when its `width` prop changes, so visible
  // pages update in place on zoom with no need to unmount them.
  useEffect(() => {
    setRenderedPages({});
  }, [pdfDocument]);

  // Scroll to active page when explicitly changed by external inputs or on initial mount
  useEffect(() => {
    const scrollToPage = () => {
      const pageEl = pageRefs.current[currentPage];
      if (pageEl && containerRef.current) {
        isScrollingToPageRef.current = true;
        pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });
        lastScrolledPageRef.current = currentPage;
        mountVisiblePages(); // mount the destination immediately (no blank frame)

        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          isScrollingToPageRef.current = false;
          isInitRef.current = false; // Only mark initialization complete after the first scroll has settled
        }, 250);
      }
    };

    if (numPages > 0 && dimensionsReady) {
      const isInitial = isInitRef.current;
      const isExplicitJump = currentPage !== lastScrolledPageRef.current;

      if (isInitial || isExplicitJump) {
        // Run with a slight timeout to ensure DOM layout has fully completed
        const timer = setTimeout(scrollToPage, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [currentPage, numPages, pdfDocument, dimensionsReady]);

  // Window of pages to keep mounted on each side of the viewport. Small enough
  // to bound canvas memory (critical on iOS), large enough for smooth scroll.
  const MOUNT_BUFFER = 2;

  // Compute which pages are visible directly from the scroll position and mount
  // only those (plus a small buffer), unmounting the rest. This replaces an
  // IntersectionObserver, which does not reliably fire inside an overflow scroll
  // container on iOS WebKit — there the canvases never mounted and pages showed
  // blank. Pages are uniformly sized, so the visible range is exact. As a bonus,
  // this is true virtualization: a 1500-page document keeps only ~10 canvases
  // alive instead of accumulating every page ever scrolled past.
  const mountVisiblePages = () => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;
    const stride = pageHeight + 15; // page height + marginBottom
    if (stride <= 0) return;
    const padTop = 20; // .panel-viewport top padding
    const top = container.scrollTop;
    const viewH = container.clientHeight;

    const first = Math.max(1, Math.floor((top - padTop) / stride) + 1 - MOUNT_BUFFER);
    const last = Math.min(numPages, Math.floor((top - padTop + viewH) / stride) + 1 + MOUNT_BUFFER);

    setRenderedPages((prev) => {
      const next: Record<number, boolean> = {};
      for (let p = first; p <= last; p++) next[p] = true;
      // Only update state if the visible window actually changed.
      const prevKeys = Object.keys(prev);
      if (prevKeys.length === last - first + 1 && prevKeys.every((k) => next[Number(k)])) {
        return prev;
      }
      return next;
    });

    // Track the page nearest the viewport center as the active page.
    if (!isScrollingToPageRef.current && !isInitRef.current) {
      const center = Math.min(
        numPages,
        Math.max(1, Math.floor((top - padTop + viewH / 2) / stride) + 1)
      );
      if (center !== lastScrolledPageRef.current) {
        lastScrolledPageRef.current = center;
        onPageChangeRef.current(center, 'scroll');
      }
    }
  };

  // Mount the initial window and keep it in sync with scrolling. rAF-throttled
  // so momentum scrolling stays smooth across platforms.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages === 0 || !dimensionsReady) return;

    mountVisiblePages(); // initial mount — no scroll event needed (fixes iOS)

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        mountVisiblePages();
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // mountVisiblePages closes over numPages/pageHeight, which are in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDocument, numPages, dimensionsReady, pageHeight]);

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

  // Jump to an internal-link destination, scrolling to the exact vertical
  // position within the target page rather than just aligning the page top.
  // Page placeholder divs always exist at their correct sizes, so the offset is
  // accurate even before the target page's canvas has lazily rendered.
  const scrollToDestination = (targetPage: number, destTop?: number) => {
    const container = containerRef.current;
    const pageEl = pageRefs.current[targetPage];
    if (!container || !pageEl) {
      onPageChange(targetPage, 'jump');
      return;
    }

    // Mark this page as already handled so the currentPage effect doesn't
    // re-scroll to the page top and clobber our precise position.
    lastScrolledPageRef.current = targetPage;
    isScrollingToPageRef.current = true;

    const containerRect = container.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    let target = container.scrollTop + (pageRect.top - containerRect.top);

    if (destTop != null) {
      const basePageHeightPoints = basePageWidthRef.current * aspectRatio;
      if (basePageHeightPoints > 0) {
        // destTop is measured in PDF points from the page bottom.
        const ratioFromTop = (basePageHeightPoints - destTop) / basePageHeightPoints;
        target += Math.max(0, ratioFromTop) * pageHeight - 24; // 24px breathing room above
      }
    }

    container.scrollTop = Math.max(0, target);
    mountVisiblePages(); // mount the destination page immediately

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingToPageRef.current = false;
    }, 250);

    // Update app-level state (active page, history, bookmark button).
    onPageChange(targetPage, 'jump');
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
              drawings={drawingsRegistry[p] || EMPTY_STROKES}
              onSaveDrawings={(strokes) => onSaveDrawings(p, strokes)}
              tool={tool}
              color={color}
              brushSize={brushSize}
              colorMap={colorMap}
              onDrawStart={() => registerViewpoint(p, 'annotated')}
              onPanelFocus={onFocusPanel}
              onJumpToPage={(targetPage, destTop) => scrollToDestination(targetPage, destTop)}
            />
          )}
        </div>
      );
    }
    return list;
  };

  return (
    <div className={`viewer-panel ${isFocused ? 'focused' : ''}`} onClick={onFocusPanel}>
      <div className="panel-header">
        <div className="panel-title">
          <span>Panel {panelId === 'left' ? 'A' : 'B'} — Page {currentPage} of {numPages}</span>
        </div>
        
        <div className="panel-controls">
          {/* View History Navigation */}
          <button 
            className="panel-btn" 
            title="Go Back in History" 
            onClick={onGoBack} 
            disabled={!canGoBack}
            style={{ opacity: canGoBack ? 1 : 0.3 }}
          >
            <ArrowLeft size={15} />
          </button>
          <button 
            className="panel-btn" 
            title="Go Forward in History" 
            onClick={onGoForward} 
            disabled={!canGoForward}
            style={{ opacity: canGoForward ? 1 : 0.3 }}
          >
            <ArrowRight size={15} />
          </button>

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
          
          {/* Bookmarking */}
          <button 
            className="panel-btn" 
            title={isBookmarked ? "Remove Bookmark" : "Add Bookmark"} 
            onClick={onToggleBookmark}
            style={{ color: isBookmarked ? 'var(--accent-secondary)' : 'inherit' }}
          >
            {isBookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          </button>

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
