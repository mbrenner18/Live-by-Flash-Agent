import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

/**
 * Patch ResizeObserver to prevent "ResizeObserver loop limit exceeded" errors.
 * This happens when the observer's callback triggers a resize of the observed element
 * within the same frame. Debouncing the callback ensures it runs in the next frame.
 */
if (typeof window !== 'undefined' && window.ResizeObserver) {
  const OriginalResizeObserver = window.ResizeObserver;
  window.ResizeObserver = class ResizeObserver extends OriginalResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        requestAnimationFrame(() => {
          try {
            if (Array.isArray(entries) && entries.length > 0) {
              callback(entries, observer);
            }
          } catch (e) {
            console.error('ResizeObserver callback failed:', e);
          }
        });
      });
    }
  };
}

// Comprehensive error suppression for ResizeObserver loop errors
const isResizeObserverError = (message: string) => 
  message.includes('ResizeObserver loop completed with undelivered notifications') ||
  message.includes('ResizeObserver loop limit exceeded');

window.addEventListener('error', (e) => {
  if (isResizeObserverError(e.message)) {
    e.stopImmediatePropagation();
    e.preventDefault();
    
    // Attempt to hide the Vite/Webpack error overlay if it appeared
    const overlay = document.querySelector('vite-error-overlay') || 
                    document.getElementById('webpack-dev-server-client-overlay');
    if (overlay) {
      (overlay as HTMLElement).style.display = 'none';
    }
  }
}, true); // Use capture to catch it early

// Also handle unhandled rejections just in case
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && isResizeObserverError(e.reason.message || '')) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
