import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

/**
 * Without a boundary, any render error unmounts the whole UI and leaves a black window.
 * Show the error (so it can be reported) and let the user reload the UI.
 */
class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[UI crash]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', color: '#e4e4e7', background: '#09090b', height: '100%' }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Something went wrong in the browser UI</h2>
        <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#f87171', marginBottom: 16 }}>
          {String(this.state.error?.stack || this.state.error)}
        </pre>
        <button
          onClick={() => location.reload()}
          style={{ padding: '6px 14px', borderRadius: 8, background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Reload UI
        </button>
      </div>
    )
  }
}

const rootElement = document.getElementById('root')

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>
  )
}
