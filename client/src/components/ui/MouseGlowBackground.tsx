import { useEffect, useRef } from 'react';

type Point = { x: number; y: number };
type GlyphParticle = {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  density: number;
  phase: number;
  glyph: string;
};

const FIELD_SIZE = 700;
const FIELD_RADIUS_X = 276;
const FIELD_RADIUS_Y = 222;
const CELL_WIDTH = 11;
const CELL_HEIGHT = 16;
const ASCII_RAMP = '.,:;!+=*#%@';
const POINTER_RADIUS = 112;

/** Draws a living ASCII field whose loose glyphs react to and trail the pointer. */
export function MouseGlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !field || !context) return;
    const container = field.parentElement;
    if (!container) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
    const initialBounds = container.getBoundingClientRect();
    const position: Point = { x: initialBounds.width / 2, y: initialBounds.height / 2 };
    const target: Point = { ...position };
    const velocity: Point = { x: 0, y: 0 };
    const lastPointer: Point = { ...position };
    const pointerPulse = { x: position.x, y: position.y, dirX: 0, dirY: 0, strength: 0 };
    const particles = createGlyphParticles();
    let frameId = 0;
    let previousTime = 0;

    const draw = (time: number) => {
      const isReducedMotion = reducedMotion.matches;
      const isDark = darkMode.matches;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(FIELD_SIZE * pixelRatio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelWidth) {
        canvas.width = pixelWidth;
        canvas.height = pixelWidth;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      }

      field.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)`;
      context.clearRect(0, 0, FIELD_SIZE, FIELD_SIZE);
      context.save();
      context.translate(FIELD_SIZE / 2, FIELD_SIZE / 2);
      context.font = '12px "Cascadia Mono", Consolas, monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.shadowColor = isDark ? 'rgba(255, 191, 73, .5)' : 'rgba(91, 132, 236, .42)';
      context.shadowBlur = 4;

      for (const particle of particles) {
        const idleDrift = isReducedMotion ? 0 : Math.sin(time * 0.0009 + particle.phase) * 1.6;
        const x = particle.x + idleDrift;
        const y = particle.y + Math.cos(time * 0.00075 + particle.phase) * (isReducedMotion ? 0 : 1.2);
        const displacement = Math.hypot(particle.x - particle.homeX, particle.y - particle.homeY);
        const returnFade = clamp(1 - displacement / 190, 0.24, 1);
        const alpha = (0.12 + particle.density * 0.78) * returnFade;

        context.fillStyle = isDark
          ? `rgba(242, 180, 58, ${alpha})`
          : `rgba(57, 86, 163, ${alpha})`;
        context.fillText(particle.glyph, x, y);
      }
      context.restore();
    };

    const animate = (time: number) => {
      const frameScale = previousTime === 0 ? 1 : Math.min((time - previousTime) / 16.667, 2);
      previousTime = time;

      // The dense center follows more slowly, so the pointer can move through it.
      velocity.x = (velocity.x + (target.x - position.x) * 0.045 * frameScale) * Math.pow(0.82, frameScale);
      velocity.y = (velocity.y + (target.y - position.y) * 0.045 * frameScale) * Math.pow(0.82, frameScale);
      position.x += velocity.x * frameScale;
      position.y += velocity.y * frameScale;

      const pulse = pointerPulse.strength;
      for (const particle of particles) {
        const ambientX = particle.homeX + Math.sin(time * 0.0009 + particle.phase) * 1.6;
        const ambientY = particle.homeY + Math.cos(time * 0.00075 + particle.phase) * 1.2;
        particle.vx += (ambientX - particle.x) * 0.012 * frameScale;
        particle.vy += (ambientY - particle.y) * 0.012 * frameScale;

        if (pulse > 0.05) {
          const worldX = position.x + particle.x;
          const worldY = position.y + particle.y;
          const awayX = worldX - pointerPulse.x;
          const awayY = worldY - pointerPulse.y;
          const distance = Math.hypot(awayX, awayY);
          if (distance < POINTER_RADIUS) {
            const falloff = (1 - distance / POINTER_RADIUS) ** 2;
            const radialX = distance === 0 ? -pointerPulse.dirX : awayX / distance;
            const radialY = distance === 0 ? -pointerPulse.dirY : awayY / distance;
            const kick = pulse * falloff * 0.11 * frameScale;
            particle.vx += (radialX * 0.9 + pointerPulse.dirX * 0.65) * kick;
            particle.vy += (radialY * 0.9 + pointerPulse.dirY * 0.65) * kick;
          }
        }

        particle.vx *= Math.pow(0.84, frameScale);
        particle.vy *= Math.pow(0.84, frameScale);
        particle.x += particle.vx * frameScale;
        particle.y += particle.vy * frameScale;
      }
      pointerPulse.strength *= Math.pow(0.84, frameScale);
      draw(time);
      frameId = window.requestAnimationFrame(animate);
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      const pointerX = clamp(event.clientX - bounds.left, 0, bounds.width);
      const pointerY = clamp(event.clientY - bounds.top, 0, bounds.height);
      const dx = pointerX - lastPointer.x;
      const dy = pointerY - lastPointer.y;
      const distance = Math.hypot(dx, dy);
      target.x = pointerX;
      target.y = pointerY;

      if (distance > 0.3) {
        pointerPulse.x = pointerX;
        pointerPulse.y = pointerY;
        pointerPulse.dirX = dx / distance;
        pointerPulse.dirY = dy / distance;
        pointerPulse.strength = Math.min(38, pointerPulse.strength + Math.min(distance, 80) * 0.52);
        lastPointer.x = pointerX;
        lastPointer.y = pointerY;
      }

      if (reducedMotion.matches) {
        position.x = target.x;
        position.y = target.y;
        resetParticles(particles);
        draw(performance.now());
      } else if (frameId === 0) {
        previousTime = 0;
        frameId = window.requestAnimationFrame(animate);
      }
    };

    const onPreferenceChange = () => {
      if (reducedMotion.matches) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
        position.x = target.x;
        position.y = target.y;
        velocity.x = 0;
        velocity.y = 0;
        pointerPulse.strength = 0;
        resetParticles(particles);
        draw(performance.now());
      } else if (frameId === 0) {
        previousTime = 0;
        frameId = window.requestAnimationFrame(animate);
      } else {
        draw(performance.now());
      }
    };

    const onResize = () => {
      const bounds = container.getBoundingClientRect();
      target.x = bounds.width / 2;
      target.y = bounds.height / 2;
      if (reducedMotion.matches) {
        position.x = target.x;
        position.y = target.y;
        draw(performance.now());
      } else if (frameId === 0) {
        previousTime = 0;
        frameId = window.requestAnimationFrame(animate);
      }
    };

    draw(performance.now());
    if (!reducedMotion.matches) frameId = window.requestAnimationFrame(animate);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', onResize);
    reducedMotion.addEventListener('change', onPreferenceChange);
    darkMode.addEventListener('change', onPreferenceChange);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      reducedMotion.removeEventListener('change', onPreferenceChange);
      darkMode.removeEventListener('change', onPreferenceChange);
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className="ascii-background" aria-hidden="true">
      <div className="ascii-background__ambient" />
      <div ref={fieldRef} className="ascii-background__field">
        <canvas ref={canvasRef} width={FIELD_SIZE} height={FIELD_SIZE} />
      </div>
      <div className="ascii-background__grain" />
      <div className="ascii-background__vignette" />
    </div>
  );
}

function createGlyphParticles(): GlyphParticle[] {
  const particles: GlyphParticle[] = [];
  for (let y = -FIELD_RADIUS_Y; y <= FIELD_RADIUS_Y; y += CELL_HEIGHT) {
    for (let x = -FIELD_RADIUS_X; x <= FIELD_RADIUS_X; x += CELL_WIDTH) {
      const distance = Math.hypot(x / FIELD_RADIUS_X, y / FIELD_RADIUS_Y);
      const angle = Math.atan2(y, x);
      const boundary = 1
        + Math.sin(angle * 2.7 + 0.4) * 0.055
        + Math.cos(angle * 5.2 - 0.7) * 0.035
        + Math.sin(angle * 8 + 1.2) * 0.018;
      if (distance > boundary) continue;

      const phase = hash(x, y) * Math.PI * 2;
      const density = clamp((boundary - distance) * 2.6 + (hash(y, x) - 0.5) * 0.16, 0, 1);
      const glyphIndex = Math.min(ASCII_RAMP.length - 1, Math.floor(density * ASCII_RAMP.length));
      const homeX = x + Math.sin(y * 0.022 + phase) * 2.4;
      const homeY = y + Math.cos(x * 0.019 + phase) * 2;
      particles.push({
        homeX,
        homeY,
        x: homeX,
        y: homeY,
        vx: 0,
        vy: 0,
        density,
        phase,
        glyph: ASCII_RAMP[glyphIndex],
      });
    }
  }
  return particles;
}

function resetParticles(particles: GlyphParticle[]): void {
  for (const particle of particles) {
    particle.x = particle.homeX;
    particle.y = particle.homeY;
    particle.vx = 0;
    particle.vy = 0;
  }
}

function hash(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
