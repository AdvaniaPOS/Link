import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to console for the operator; the UI shows a friendly fallback.
    // eslint-disable-next-line no-console
    console.error("UI error:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="p-6">
          <div className="max-w-lg mx-auto rounded-xl border border-rose-200 bg-rose-50 p-5 space-y-3">
            <div className="font-semibold text-rose-900">Noe gikk galt</div>
            <div className="text-sm text-rose-800">
              Et uventet feil oppstod i grensesnittet. Du kan prøve å laste siden på
              nytt eller gå tilbake.
            </div>
            <pre className="text-xs text-rose-900/70 whitespace-pre-wrap break-words bg-white/60 p-2 rounded border border-rose-100">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 text-sm bg-rose-600 text-white rounded-md hover:bg-rose-700"
              >
                Last på nytt
              </button>
              <button
                onClick={this.reset}
                className="px-3 py-1.5 text-sm bg-white text-rose-700 border border-rose-300 rounded-md hover:bg-rose-50"
              >
                Lukk feilmelding
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
