"use client";

import { Component, type ReactNode } from "react";

/** Un widget che fallisce mostra una scheda d'errore al suo posto invece di far cadere l'intera pagina. */
export class WidgetBoundary extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error(`[hub/widget:${this.props.label}]`, err);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="card">
        <p className="muted small" style={{ margin: 0 }}>
          «{this.props.label}» non è disponibile in questo momento. Il resto della pagina funziona.
        </p>
      </div>
    );
  }
}
