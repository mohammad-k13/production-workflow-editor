import { MouseGlowBackground } from './components/ui/MouseGlowBackground.tsx';
import { WorkflowEditor } from './editor/WorkflowEditor.tsx';

export function App() {
  return (
    <main className="ascii-page" aria-label="Production workflow editor">
      <section className="glass-panel" aria-label="Workflow editor">
        <MouseGlowBackground />
        <WorkflowEditor />
        <div className="glass-surface" aria-hidden="true" />
      </section>
    </main>
  );
}
