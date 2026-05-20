import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { ensureBrowserLocalNotes } from './browserLocalNotes';
import { SpeedInsights } from '@vercel/speed-insights/react';

ensureBrowserLocalNotes();

type ErrorBoundaryState = { hasError: boolean; message: string };

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown startup error'
    };
  }

  componentDidCatch(error: unknown) {
    console.error('Dux Notes startup error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="startup-error-screen">
        <div className="startup-error-card">
          <div className="logo-mark">DN</div>
          <h1>Dux Notes had trouble opening</h1>
          <p>The app is safe, but one saved local setting or document may be corrupted. Try restarting first. If it still opens blank, reset local app data.</p>
          <code>{this.state.message}</code>
          <div className="startup-error-actions">
            <button onClick={() => window.location.reload()}>Restart app</button>
            <button
              className="danger-button"
              onClick={() => {
                if (window.confirm('Reset local Dux Notes browser settings? This clears local app settings in this window.')) {
                  window.localStorage.clear();
                  window.sessionStorage.clear();
                  window.location.reload();
                }
              }}
            >Reset local settings</button>
          </div>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
      <SpeedInsights />
    </AppErrorBoundary>
  </React.StrictMode>
);
