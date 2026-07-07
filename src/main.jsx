import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('App crash:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ maxWidth: 460, background: '#16151b', border: '1px solid #2a2833', borderRadius: 12, padding: 24, color: '#ece7db' }}>
            <div style={{ color: '#ff5757', fontWeight: 800, letterSpacing: 1, fontSize: 13, marginBottom: 10 }}>ERROR AL CARGAR EL TABLERO</div>
            <p style={{ color: '#8b8676', fontSize: 14, lineHeight: 1.6, margin: '0 0 12px' }}>
              La app se abrió pero algo falló al arrancar. Copia este detalle y compártelo:
            </p>
            <pre style={{ background: '#0a0a0d', border: '1px solid #2a2833', borderRadius: 8, padding: 12, fontSize: 12, color: '#ffb62e', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
              {String(this.state.error?.stack || this.state.error)}
            </pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: 14, background: '#ffb62e', color: '#1a1200', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' }}>
              Reintentar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Register the service worker for PWA install / offline shell.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
