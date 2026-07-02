import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './lib/ThemeContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)

// Register the PWA service worker. Skipped on localhost so dev HMR stays clean.
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
if ('serviceWorker' in navigator && !isLocalhost) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration failure is non-fatal */
    })
  })
}
