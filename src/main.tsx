import React from 'react';
import ReactDOM from 'react-dom/client';
import './lib/tauriBridge'; // Initializes Tauri desktop API bridge
import { checkForUpdate } from './lib/updater';
import App from './App';
import './styles/global.css';

// Check for app updates on startup (desktop builds only).
void checkForUpdate();

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
