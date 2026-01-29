import { Component, ReactNode, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-factory-bg p-8">
          <div className="factory-panel p-6 max-w-lg w-full">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-3 h-3 rounded-full bg-signal-red animate-pulse" />
              <h1 className="text-xl font-bold text-signal-red">System Error</h1>
            </div>

            <div className="mb-4 text-sm text-gray-400">
              <p>A component has encountered an error and the dashboard cannot continue.</p>
            </div>

            <div className="mb-6 p-3 bg-black/30 rounded border border-factory-border overflow-auto max-h-48">
              <code className="text-xs text-signal-yellow font-mono whitespace-pre-wrap">
                {this.state.error?.message || 'Unknown error'}
              </code>
              {this.state.errorInfo && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                    Stack trace
                  </summary>
                  <pre className="text-[10px] text-gray-600 mt-2 overflow-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-signal-green/20 border border-signal-green/50 text-signal-green rounded hover:bg-signal-green/30 transition-colors text-sm"
              >
                Retry
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-factory-highlight border border-factory-border text-gray-300 rounded hover:bg-factory-border transition-colors text-sm"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
