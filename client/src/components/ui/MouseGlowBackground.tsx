import { useEffect, useRef } from 'react';

type Point = { x: number; y: number };

/** A soft, spring-driven glow that follows the pointer without blocking the canvas. */
export function MouseGlowBackground() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const position: Point = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const target: Point = { ...position };
    const velocity: Point = { x: 0, y: 0 };
    const spring = 0.105;
    const damping = 0.76;
    let animationFrame = 0;
    let previousTime = 0;

    const render = () => {
      glow.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)`;
    };

    const animate = (time: number) => {
      const frameScale = previousTime === 0 ? 1 : Math.min((time - previousTime) / 16.667, 2);
      previousTime = time;

      velocity.x = (velocity.x + (target.x - position.x) * spring * frameScale) * Math.pow(damping, frameScale);
      velocity.y = (velocity.y + (target.y - position.y) * spring * frameScale) * Math.pow(damping, frameScale);
      position.x += velocity.x * frameScale;
      position.y += velocity.y * frameScale;
      render();

      const settled = Math.abs(target.x - position.x) + Math.abs(target.y - position.y) < 0.2
        && Math.abs(velocity.x) + Math.abs(velocity.y) < 0.2;
      if (settled) {
        position.x = target.x;
        position.y = target.y;
        velocity.x = 0;
        velocity.y = 0;
        render();
        animationFrame = 0;
        return;
      }
      animationFrame = window.requestAnimationFrame(animate);
    };

    const onPointerMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;
      if (prefersReducedMotion.matches) {
        position.x = target.x;
        position.y = target.y;
        render();
      } else if (animationFrame === 0) {
        previousTime = 0;
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    const onMotionPreferenceChange = () => {
      if (prefersReducedMotion.matches) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        position.x = target.x;
        position.y = target.y;
        render();
      }
    };

    render();
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    prefersReducedMotion.addEventListener('change', onMotionPreferenceChange);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      prefersReducedMotion.removeEventListener('change', onMotionPreferenceChange);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className="mouse-glow-background" aria-hidden="true">
      <div ref={glowRef} className="mouse-glow-background__orb" />
      <div className="mouse-glow-background__grain" />
      <div className="mouse-glow-background__vignette" />
    </div>
  );
}
