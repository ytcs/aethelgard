# aethelgard

A quiet, distraction-free web application designed for reading long technical PDF books. Built with a focus on cognitive clarity, fluid navigation, and organic note-taking.

---

## The Philosophy

Technical books demand focus. Traditional PDF readers introduce cognitive fatigue through cluttered toolbars, flashing AI pop-ups, and snapping viewports. **aethelgard** is built on the principles of **Nordic Minimalism** to create a digital "Zen mode" workspace:

- **Earthy Palettes:** Muted off-black backgrounds, sage greens, warm clays, and sand gold drawing tones desaturated to resemble natural paper inks.
- **Cognitive Clarity:** Sidebar collapsed by default. No glowing gradients or floating chatbots.
- **Focus-First Layouts:** Dual-pane split views to pin reference materials (like theorems or figures) on one panel while scrolling through explanations on the other.

---

## Core Features

1. **Persistent Canvas Continuous Scroll:**
   - Seamless vertical page scrolling.
   - Canvases are lazy-loaded when entering the viewport and kept cached in the DOM, making scrolling back and forth native-smooth and lag-free.
2. **Fit-to-Width default zoom:**
   - Automatically fits pages to the panel width on document load.
3. **Smart Viewpoint History:**
   - A quiet background observer remembers where you've been. It ignores sequential page flips, but logs out-of-order jumps, bookmark clicks, and pages read for more than 5 seconds.
4. **Transparent Scribble Overlay:**
   - Sketch, highlight, or erase directly over the PDF text. Drawings scale and align automatically during viewport zooms.
5. **Math Scratchpad:**
   - Switch any viewer panel into a dedicated drawing whiteboard for deriving equations, supporting neon-free desaturated colors and Bezier-smoothed strokes.
6. **Session Memory:**
   - Automatically remembers your document paths, layout split, zoom factors, and page positions across browser refreshes.

---

## Installation & Setup

Ensure you have **Node.js** and **npm** installed.

```bash
# Clone the repository
git clone https://github.com/ytcs/aethelgard.git
cd aethelgard

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

The application will launch locally at **http://localhost:5173/**.

---

## Technology Stack

- **Core:** React, TypeScript, Vite
- **PDF Engine:** PDF.js (Mozilla)
- **Styling:** Vanilla CSS3
- **Icons:** Lucide React
