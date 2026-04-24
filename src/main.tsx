import React from 'react';
import ReactDOM from 'react-dom/client';
import './lib/tauriBridge'; // Initializes Tauri desktop API bridge
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
