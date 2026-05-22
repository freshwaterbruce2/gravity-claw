import React from 'react';
import ReactDOM from 'react-dom/client';
import { tauriBridgeReady } from './lib/tauriBridge';
import App from './App';
import './styles/global.css';

async function bootstrap(): Promise<void> {
  await tauriBridgeReady;

  const rootElement = document.getElementById('root');
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}

void bootstrap();
