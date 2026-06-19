import React, { useRef, useEffect, useState } from 'react';
import type { MouseEvent, TouchEvent } from 'react';
import type { Stroke, Point, DrawingTool, DrawingColor, BrushSize } from '../types';
import { Undo2, Redo2, Trash2, Download } from 'lucide-react';

interface WhiteboardProps {
  tool: DrawingTool;
  color: DrawingColor;
  brushSize: BrushSize;
  colorMap: Record<DrawingColor, string>;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({
  tool,
  color,
  brushSize,
  colorMap,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const currentPoints = useRef<Point[]>([]);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('aethelgard_scratchpad_strokes');
    if (saved) {
      try {
        setStrokes(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load scratchpad drawings', e);
      }
    }
  }, []);

  // Save to local storage when strokes change
  const saveStrokes = (newStrokes: Stroke[]) => {
    setStrokes(newStrokes);
    localStorage.setItem('aethelgard_scratchpad_strokes', JSON.stringify(newStrokes));
  };

  // Resize canvas to match container
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      
      // Save current drawings content
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0);
      }

      canvas.width = rect.width;
      canvas.height = rect.height - 44; // Minus panel-header height

      // Redraw everything
      redrawCanvas();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [strokes]); // Re-trigger when strokes change to ensure they display after resize

  // Redraw the entire canvas
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    strokes.forEach((stroke) => {
      drawStroke(ctx, stroke);
    });
  };

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
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = stroke.width * 2.5;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = 1.0;
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

  // Drawing event handlers
  const getCoordinates = (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
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
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handleStart = (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (tool === 'select') return;
    const coord = getCoordinates(e);
    if (!coord) return;

    setIsDrawing(true);
    currentPoints.current = [coord];

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        // Visual feedback during drawing
        const activeColor = colorMap[color];
        const stroke: Stroke = {
          points: [coord],
          color: activeColor,
          width: brushSize,
          tool: tool as any,
        };
        drawStroke(ctx, stroke);
        ctx.restore();
      }
    }
  };

  const handleMove = (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const coord = getCoordinates(e);
    if (!coord) return;

    currentPoints.current.push(coord);

    const canvas = canvasRef.current;
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
        // Redraw canvas and draw active stroke
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        strokes.forEach(s => drawStroke(ctx, s));
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
      const updated = [...strokes, newStroke];
      saveStrokes(updated);
      setRedoStack([]); // Clear redo stack on new action
    }
    currentPoints.current = [];
  };

  // Actions
  const handleUndo = () => {
    if (strokes.length === 0) return;
    const last = strokes[strokes.length - 1];
    const updated = strokes.slice(0, -1);
    saveStrokes(updated);
    setRedoStack([...redoStack, last]);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    const updatedRedo = redoStack.slice(0, -1);
    const updatedStrokes = [...strokes, last];
    saveStrokes(updatedStrokes);
    setRedoStack(updatedRedo);
  };

  const handleClear = () => {
    if (window.confirm('Clear the entire whiteboard?')) {
      saveStrokes([]);
      setRedoStack([]);
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create a temporary canvas with a dark background to export
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) return;

    // Fill background
    exportCtx.fillStyle = '#0b0c12';
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    // Draw current canvas on top
    exportCtx.drawImage(canvas, 0, 0);

    const dataUrl = exportCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'aethelgard_whiteboard_scratchpad.png';
    link.href = dataUrl;
    link.click();
  };

  return (
    <div ref={containerRef} className="whiteboard-container">
      <div className="panel-header">
        <div className="panel-title">
          <span>Math Scratchpad Whiteboard</span>
        </div>
        <div className="panel-controls">
          <button
            className="panel-btn"
            title="Undo (Ctrl+Z)"
            onClick={handleUndo}
            disabled={strokes.length === 0}
            style={{ opacity: strokes.length === 0 ? 0.4 : 1 }}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="panel-btn"
            title="Redo (Ctrl+Y)"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            style={{ opacity: redoStack.length === 0 ? 0.4 : 1 }}
          >
            <Redo2 size={16} />
          </button>
          <button
            className="panel-btn"
            title="Clear Scratchpad"
            onClick={handleClear}
            disabled={strokes.length === 0}
            style={{ opacity: strokes.length === 0 ? 0.4 : 1 }}
          >
            <Trash2 size={16} />
          </button>
          <div className="toolbar-divider" style={{ height: '16px' }}></div>
          <button
            className="panel-btn"
            title="Export Scratchpad as PNG"
            onClick={handleDownload}
          >
            <Download size={16} />
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="whiteboard-canvas"
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
