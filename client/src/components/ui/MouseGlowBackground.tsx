import { useEffect, useRef } from 'react';

type Point = { x: number; y: number };
type GlyphCell = Point & { glyph: string; seed: number; density: number };
type TrailPoint = Point & { time: number; strength: number };

const CELL_WIDTH = 9;
const CELL_HEIGHT = 12;
const BASE_FONT_SIZE = 10;
const FONT_FAMILY = '"Cascadia Mono", Consolas, monospace';
const ASCII_RAMP = '.,:;!+=*#%@';
const POINTER_RADIUS = 52;
const TRAIL_RADIUS = 62;
const TRAIL_LIFETIME_MS = 1_200;
const MAX_TRAIL_POINTS = 96;
const MIN_GLOW = 0.035;

/** A full-page ASCII field with a fading trail along the pointer's path. */
export function MouseGlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    const context = canvas?.getContext('2d');
    const background = document.createElement('canvas');
    const backgroundContext = background.getContext('2d');
    if (!canvas || !container || !context || !backgroundContext) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
    const bounds = container.getBoundingClientRect();
    let width = bounds.width;
    let height = bounds.height;
    let rows = createGlyphRows(width, height);
    let pointer: Point = { x: width / 2, y: height / 2 };
    let previousPointer: Point | null = null;
    let cursorEnergy = 0;
    let trail: TrailPoint[] = [];
    let frameId = 0;
    let previousTime = 0;
    let paintBackground = true;

    const draw = (time: number) => {
      const isDark = darkMode.matches;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const pixelWidth = Math.round(width * pixelRatio);
      const pixelHeight = Math.round(height * pixelRatio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        paintBackground = true;
      }

      if (paintBackground) {
        background.width = pixelWidth;
        background.height = pixelHeight;
        backgroundContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        backgroundContext.textAlign = 'center';
        backgroundContext.textBaseline = 'middle';
        backgroundContext.font = `${BASE_FONT_SIZE}px ${FONT_FAMILY}`;
        backgroundContext.fillStyle = isDark ? '#c6cdde' : '#35425c';
        for (const row of rows) {
          for (const cell of row) {
            backgroundContext.globalAlpha = 0.11 + cell.seed * 0.05;
            backgroundContext.fillText(cell.glyph, cell.x, cell.y);
          }
        }
        paintBackground = false;
      }

      if (pixelWidth === 0 || pixelHeight === 0) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.drawImage(background, 0, 0, pixelWidth / pixelRatio, pixelHeight / pixelRatio);
      context.textAlign = 'center';
      context.textBaseline = 'middle';

      // Each sample visits only nearby rows and columns, even when the trail
      // stretches diagonally across most of the screen.
      const highlights = new Map<GlyphCell, number>();
      addGlow(rows, highlights, pointer, POINTER_RADIUS, cursorEnergy);
      for (const sample of trail) {
        const age = time - sample.time;
        if (age < 0 || age >= TRAIL_LIFETIME_MS) continue;
        const strength = sample.strength * (1 - age / TRAIL_LIFETIME_MS) ** 1.7 * 0.88;
        addGlow(rows, highlights, sample, TRAIL_RADIUS, strength);
      }

      for (const [cell, influence] of highlights) {
        const level = Math.min(
          ASCII_RAMP.length - 1,
          Math.floor(cell.density * (ASCII_RAMP.length - 1) + influence * 5),
        );
        const glyph = ASCII_RAMP[level];
        const fontSize = BASE_FONT_SIZE + influence * 5;
        const hue = isDark ? 34 + cell.seed * 34 : 188 + cell.seed * 94;
        const lightness = isDark ? 62 : 43 + cell.seed * 12;
        context.font = `${fontSize.toFixed(1)}px ${FONT_FAMILY}`;
        context.fillStyle = `hsla(${hue}, 92%, ${lightness}%, ${influence * 0.84})`;
        context.shadowColor = `hsla(${hue}, 94%, ${lightness + 8}%, 0.6)`;
        context.shadowBlur = influence * 4;
        context.fillText(glyph, cell.x, cell.y);
      }
      context.shadowBlur = 0;
    };

    const animateTrail = (time: number) => {
      const frameScale = previousTime === 0 ? 1 : Math.min((time - previousTime) / 16.667, 2);
      previousTime = time;
      cursorEnergy *= Math.pow(0.94, frameScale);
      trail = trail.filter((sample) => time - sample.time < TRAIL_LIFETIME_MS);
      draw(time);

      if (cursorEnergy < 0.015 && trail.length === 0) {
        cursorEnergy = 0;
        draw(time);
        frameId = 0;
        return;
      }
      frameId = window.requestAnimationFrame(animateTrail);
    };

    const startTrailAnimation = () => {
      if (reducedMotion.matches || frameId !== 0) return;
      previousTime = 0;
      frameId = window.requestAnimationFrame(animateTrail);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const next = {
        x: clamp(event.clientX - rect.left, 0, rect.width),
        y: clamp(event.clientY - rect.top, 0, rect.height),
      };
      const last = previousPointer ?? next;
      if (!previousPointer) {
        previousPointer = next;
        cursorEnergy = 0.42;
      }
      const dx = next.x - last.x;
      const dy = next.y - last.y;
      const distance = Math.hypot(dx, dy);
      pointer = next;

      if (distance > 2) {
        const segments = Math.min(18, Math.ceil(distance / 7));
        const strength = clamp(0.42 + distance / 72, 0.42, 1);
        if (!reducedMotion.matches) {
          const now = performance.now();
          for (let index = 1; index <= segments; index += 1) {
            const progress = index / segments;
            trail.push({
              x: last.x + dx * progress,
              y: last.y + dy * progress,
              time: now - (segments - index) * 2,
              strength,
            });
          }
          if (trail.length > MAX_TRAIL_POINTS) trail = trail.slice(-MAX_TRAIL_POINTS);
        }
        cursorEnergy = Math.max(cursorEnergy, strength);
        previousPointer = next;
      }

      if (reducedMotion.matches) {
        draw(performance.now());
      } else {
        startTrailAnimation();
      }
    };

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      rows = createGlyphRows(width, height);
      trail = [];
      paintBackground = true;
      pointer = { x: width / 2, y: height / 2 };
      previousPointer = null;
      draw(performance.now());
    };

    const onPreferenceChange = () => {
      if (reducedMotion.matches) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
        trail = [];
      }
      paintBackground = true;
      draw(performance.now());
    };

    draw(performance.now());
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', resizeCanvas);
    reducedMotion.addEventListener('change', onPreferenceChange);
    darkMode.addEventListener('change', onPreferenceChange);
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', resizeCanvas);
      reducedMotion.removeEventListener('change', onPreferenceChange);
      darkMode.removeEventListener('change', onPreferenceChange);
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className="ascii-background" aria-hidden="true">
      <div className="ascii-background__ambient" />
      <canvas ref={canvasRef} className="ascii-background__canvas" />
      <div className="ascii-background__grain" />
      <div className="ascii-background__vignette" />
    </div>
  );
}

function createGlyphRows(width: number, height: number): GlyphCell[][] {
  const rows: GlyphCell[][] = [];
  let row = 0;
  for (let y = CELL_HEIGHT / 2; y < height; y += CELL_HEIGHT, row += 1) {
    const cells: GlyphCell[] = [];
    let column = 0;
    const offset = row % 2 === 0 ? 0 : CELL_WIDTH / 2;
    for (let x = CELL_WIDTH / 2 + offset; x < width; x += CELL_WIDTH, column += 1) {
      const seed = hash(column, row);
      const texture = 0.5 + Math.sin(column * 0.19 + row * 0.11) * 0.2;
      const density = clamp(texture * 0.55 + seed * 0.55, 0, 1);
      const glyphIndex = Math.floor(density * (ASCII_RAMP.length - 1));
      cells.push({ x, y, seed, density, glyph: ASCII_RAMP[glyphIndex] });
    }
    rows.push(cells);
  }
  return rows;
}

function addGlow(
  rows: GlyphCell[][], highlights: Map<GlyphCell, number>, point: Point, radius: number, strength: number,
) {
  if (strength <= MIN_GLOW) return;
  const firstRow = Math.max(0, Math.ceil((point.y - radius - CELL_HEIGHT / 2) / CELL_HEIGHT));
  const lastRow = Math.min(rows.length - 1, Math.floor((point.y + radius - CELL_HEIGHT / 2) / CELL_HEIGHT));
  const radiusSquared = radius * radius;
  for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row.length) continue;
    const firstColumn = Math.max(0, Math.ceil((point.x - radius - row[0].x) / CELL_WIDTH));
    const lastColumn = Math.min(row.length - 1, Math.floor((point.x + radius - row[0].x) / CELL_WIDTH));
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const cell = row[column];
      const falloff = 1 - distanceSquared(cell, point) / radiusSquared;
      if (falloff <= 0) continue;
      const influence = strength * falloff ** 2;
      if (influence > Math.max(MIN_GLOW, highlights.get(cell) ?? 0)) highlights.set(cell, influence);
    }
  }
}

function distanceSquared(first: Point, second: Point): number {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return dx * dx + dy * dy;
}

function hash(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
