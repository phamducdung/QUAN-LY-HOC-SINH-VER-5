import React, { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  // @ts-ignore
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: any): State {
    const parsedError = error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : (error?.message || 'Lỗi giao diện'));
    return {
      hasError: true,
      error: parsedError,
    };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[ErrorBoundary] Caught runtime error:', error, errorInfo);
  }

  handleReset = () => {
    // @ts-ignore
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    // @ts-ignore
    if (this.state.hasError) {
      // @ts-ignore
      const errorMessage = this.state.error?.message || 'Đã xảy ra sự cố không mong muốn trong giao diện.';

      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-white">Đã xảy ra sự cố giao diện</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Dữ liệu trên máy của bạn đã được bảo vệ an toàn. Bạn có thể bấm nút bên dưới để tải lại ứng dụng.
              </p>
            </div>

            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-left">
              <p className="text-[11px] font-mono text-rose-300 break-all">
                {errorMessage}
              </p>
            </div>

            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tải lại ứng dụng</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}
