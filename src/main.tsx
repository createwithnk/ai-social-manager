import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import LocaleProvider from './LocaleProvider'
import RuntimeBoundary, { RuntimeMonitoring } from './RuntimeBoundary'
createRoot(document.getElementById('root')!, { onCaughtError: () => { /* The boundary reports a fixed code instead of raw error details. */ } }).render(<StrictMode><LocaleProvider><RuntimeBoundary><RuntimeMonitoring /><App /></RuntimeBoundary></LocaleProvider></StrictMode>)
