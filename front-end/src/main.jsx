import "temporal-polyfill/global"; // required by @schedule-x before anything else
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/theme.css'   // design tokens first, so index.css/pages can use them
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './theme/ThemeProvider'
import { ToastProvider } from './components/ToastProvider'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
