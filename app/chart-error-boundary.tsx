"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; marketKey: string; onReload: () => void };
type State = { error: Error | null; resetKey: string };

export class ChartErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.marketKey };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.marketKey !== state.resetKey ? { error: null, resetKey: props.marketKey } : null;
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Chart sync error", { operation: "render", market: this.props.marketKey, message: error.message, stack: error.stack ?? info.componentStack });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="chart-recovery" role="alert"><strong>Chart encountered an update error.</strong><button onClick={() => { this.setState({ error: null }); this.props.onReload(); }} type="button">Reload chart</button></div>;
  }
}
