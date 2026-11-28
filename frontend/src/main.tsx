import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './lib/ThemeContext'
import App from './App'
import { retirerServiceWorker } from './utils/serviceWorker'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)

// Plus de service worker (lot 29-A) : on retire celui qu'un navigateur aurait
// gardé d'une version précédente, avec son cache.
void retirerServiceWorker()
