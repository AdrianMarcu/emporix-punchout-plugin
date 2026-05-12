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

export default function RemoteComponent({ appState = { tenant: '', token: '', language: 'en' } }: RemoteComponentProps) {
  setToken(appState.token);
  return <App />;
}
