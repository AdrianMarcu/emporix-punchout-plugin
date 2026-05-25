import { Component, ReactNode } from 'react';
import { setToken } from './api';
import App from './App';

export interface AppState {
  tenant: string;
  token: string;
  language: string;
}

interface RemoteComponentProps {
  appState?: AppState;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, fontFamily: 'monospace', color: 'red', background: '#fff1f0', border: '1px solid red', borderRadius: 4 }}>
          <strong>Punchout Plugin Error:</strong> {(this.state.error as Error).message}
          <pre style={{ fontSize: 12, marginTop: 8 }}>{(this.state.error as Error).stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RemoteComponent({ appState = { tenant: '', token: '', language: 'en' } }: RemoteComponentProps) {
  setToken(appState.token);
  return <ErrorBoundary><App /></ErrorBoundary>;
}
