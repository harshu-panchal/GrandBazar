import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Prevent mouse-wheel from changing values in focused number inputs
document.addEventListener(
  'wheel',
  (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.type === 'number' &&
      document.activeElement === target
    ) {
      event.preventDefault();
    }
  },
  { passive: false },
);

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
