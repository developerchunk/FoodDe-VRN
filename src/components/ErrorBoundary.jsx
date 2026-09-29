import { Component } from "react";

/**
 * Anything rather than a blank page.
 *
 * A render error unmounts the whole tree, and React's default is an empty
 * document — no message, no way back, nothing to report. On a storefront that
 * takes money that is the worst possible failure: a guest cannot tell whether
 * their order went through.
 *
 * This is the net, not a fix. Whatever threw is still a bug; this makes it
 * visible and leaves the guest somewhere they can act.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("render failed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <h1 className="section-title">Something went wrong on this page</h1>
          <p className="muted">
            Your order is safe — anything already placed is on its way. Try
            again, or go back to the menu.
          </p>
          <div className="empty-state__actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <a href="/menu" className="btn btn-ghost">
              Menu
            </a>
          </div>
        </div>
      </main>
    );
  }
}
