'use client';

import { Component, type ReactNode } from 'react';

/**
 * Around a piece loaded on demand (3D hero, reel, parallax stage). If its
 * chunk fails to load or it throws, it renders nothing and the page keeps
 * its fallback, instead of Next replacing the whole page with an error.
 */
export class Island extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
