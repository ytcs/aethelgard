import React, { useRef, useEffect, useState } from 'react';
import type { MouseEvent, TouchEvent } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Stroke, Point, DrawingTool, DrawingColor, BrushSize } from '../types';

interface PDFPageRenderProps {
  pdfDocument: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  width: number;
  height: number;
  drawings: Stroke[];
  onSaveDrawings: (strokes: Stroke[]) => void;
  tool: DrawingTool;
  color: DrawingColor;
  brushSize: BrushSize;
  colorMap: Record<DrawingColor, string>;
  onDrawStart: () => void;
  onPanelFocus: () => void;
  onJumpToPage?: (pageNumber: number, destTop?: number) => void;
}

export const PDFPageRender: React.FC<PDFPageRenderProps> = ({
  pdfDocument,
  pageNumber,
  width,
  height,
  drawings,
  onSaveDrawings,
  tool,
  color,
  brushSize,
  colorMap,
  onDrawStart,
  onPanelFocus,
  onJumpToPage,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const currentPoints = useRef<Point[]>([]);

  // Render page onto the underlay canvas
  useEffect(() => {
    let isCancelled = false;
    let renderTask: any = null;

    const render = async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const baseViewport = page.getViewport({ scale: 1.0 });
        const scale = width / baseViewport.width;
        const pageViewport = page.getViewport({ scale });

        // Set canvas buffer sizes to match the page viewport
        canvas.width = pageViewport.width;
        canvas.height = pageViewport.height;

        const renderContext = {
          canvasContext: ctx,
          viewport: pageViewport,
        } as any;

        renderTask = page.render(renderContext);
        await renderTask.promise;

        // Render annotation layer for links/hyperlinks
        if (isCancelled) return;
        const annotationLayerDiv = annotationLayerRef.current;
        if (annotationLayerDiv) {
          annotationLayerDiv.innerHTML = '';

          // pdf.js sizes the annotation layer via setLayerDimensions(), which
          // reads these CSS variables. They're normally provided by pdf.js's
          // `.pdfViewer .page` wrapper, which we don't use — so we must set them
          // here, or the layer collapses and link hotspots become unclickable.
          annotationLayerDiv.style.setProperty('--scale-factor', String(scale));
          annotationLayerDiv.style.setProperty('--total-scale-factor', String(scale));
          annotationLayerDiv.style.setProperty('--user-unit', '1');
          annotationLayerDiv.style.setProperty('--scale-round-x', '1px');
          annotationLayerDiv.style.setProperty('--scale-round-y', '1px');

          const annotations = await page.getAnnotations();
          if (isCancelled) return;

          if (annotations.length > 0) {
            // Resolve a PDF destination (named or explicit array) to a 1-based
            // page number and jump to it. pdf.js 6 calls `goToDestination` on
            // an internal link click (the old name was `navigateTo`).
            const goToDestination = async (dest: any) => {
              try {
                let targetDest = dest;
                if (typeof dest === 'string') {
                  targetDest = await pdfDocument.getDestination(dest);
                }
                if (Array.isArray(targetDest)) {
                  const destRef = targetDest[0];
                  const pageIdx = await pdfDocument.getPageIndex(destRef);
                  const targetPage = pageIdx + 1;

                  // Extract the destination's vertical position (PDF points,
                  // measured from the page bottom) so we can scroll to the exact
                  // spot rather than just the top of the page. The coordinate's
                  // position in the array depends on the fit mode.
                  const mode = targetDest[1]?.name;
                  let destTop: number | undefined;
                  if (mode === 'XYZ') destTop = targetDest[3] ?? undefined;       // [ref, XYZ, left, top, zoom]
                  else if (mode === 'FitH' || mode === 'FitBH') destTop = targetDest[2] ?? undefined; // [ref, FitH, top]
                  else if (mode === 'FitR') destTop = targetDest[5] ?? undefined; // [ref, FitR, left, bottom, right, top]

                  if (onJumpToPage) {
                    onJumpToPage(targetPage, destTop);
                  }
                }
              } catch (err) {
                console.error('Error navigating to destination:', err);
              }
            };

            const linkService = {
              goToDestination,
              navigateTo: goToDestination, // legacy alias
              goToPage: (pageNumber: number) => {
                if (onJumpToPage && Number.isFinite(pageNumber)) onJumpToPage(pageNumber);
              },
              getDestinationHash: (_dest: any) => '#',
              getAnchorUrl: (_hash: any) => '#',
              setHash: (_hash: any) => {},
              executeNamedAction: (_action: any) => {},
              cachePageRef: () => {},
              isPageVisible: () => true,
              isPageRendered: () => true,
            };

            const annotationLayer = new pdfjsLib.AnnotationLayer({
              div: annotationLayerDiv,
              page: page,
              viewport: pageViewport.clone({ dontFlip: true }),
              linkService: linkService,
              accessibilityManager: null,
              annotationCanvasMap: null,
              annotationEditorUIManager: null,
              structTreeLayer: null,
              commentManager: null,
              annotationStorage: null
            } as any);

            await annotationLayer.render({
              viewport: pageViewport.clone({ dontFlip: true }),
              div: annotationLayerDiv,
              annotations: annotations,
              page: page,
              linkService: linkService,
              renderForms: false,
            } as any);
          }
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error(`Error rendering page ${pageNumber}:`, err);
        }
      }
    };

    render();

    return () => {
      isCancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDocument, pageNumber, width]);

  // Sync drawing canvas overlay size and redraw strokes
  useEffect(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawings.forEach((stroke) => {
      drawStroke(ctx, stroke);
    });
  }, [drawings, width, height]);

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length === 0) return;

    ctx.save();
    ctx.beginPath();

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = stroke.width * 2;
    } else if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = stroke.width * 2.5;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = stroke.width;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const points = stroke.points;
    if (points.length === 1) {
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[0].x, points[0].y);
      ctx.stroke();
    } else {
      ctx.moveTo(points[0].x, points[0].y);
      let i;
      for (i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    }

    ctx.restore();
  };

  const getCoordinates = (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>): Point | null => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handleStart = (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => {
    onPanelFocus();
    if (tool === 'select') return;
    const coord = getCoordinates(e);
    if (!coord) return;

    setIsDrawing(true);
    currentPoints.current = [coord];

    const canvas = drawingCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const activeColor = colorMap[color];
        const stroke: Stroke = {
          points: [coord],
          color: activeColor,
          width: brushSize,
          tool: tool as any,
        };
        drawStroke(ctx, stroke);
      }
    }
  };

  const handleMove = (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const coord = getCoordinates(e);
    if (!coord) return;

    currentPoints.current.push(coord);

    const canvas = drawingCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const activeColor = colorMap[color];
        const stroke: Stroke = {
          points: currentPoints.current,
          color: activeColor,
          width: brushSize,
          tool: tool as any,
        };
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawings.forEach(s => drawStroke(ctx, s));
        drawStroke(ctx, stroke);
      }
    }
  };

  const handleEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentPoints.current.length > 0) {
      const activeColor = colorMap[color];
      const newStroke: Stroke = {
        points: [...currentPoints.current],
        color: activeColor,
        width: brushSize,
        tool: tool as any,
      };

      onSaveDrawings([...drawings, newStroke]);
      onDrawStart();
    }
    currentPoints.current = [];
  };

  return (
    <div style={{ position: 'relative', width: `${width}px`, height: `${height}px` }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      <div 
        ref={annotationLayerRef} 
        className="annotationLayer" 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          pointerEvents: tool === 'select' ? 'auto' : 'none',
        }}
      />
      <canvas
        ref={drawingCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 2,
          cursor: tool === 'select' ? 'default' : 'crosshair',
          pointerEvents: tool === 'select' ? 'none' : 'auto',
        }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />
    </div>
  );
};
