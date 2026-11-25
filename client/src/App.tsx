import { MouseGlowBackground } from './components/ui/MouseGlowBackground.tsx';

export function App() {
  return (
    <main className="ascii-page" aria-label="Interactive ASCII background">
      <section className="glass-panel" aria-label="Animated background">
        <MouseGlowBackground />
        <div className="glass-surface" aria-hidden="true" />
      </section>
    </main>
  );
}
