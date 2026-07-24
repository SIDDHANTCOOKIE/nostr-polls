import React from "react";
import { Box, Button, Typography } from "@mui/material";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * When this value changes, the boundary clears a caught error and re-renders
   * its children. Route-level boundaries pass the current pathname so navigating
   * away from a broken screen automatically recovers.
   */
  resetKey?: unknown;
  /** Optional custom fallback. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors in the subtree so one broken screen or widget
 * can't blank the whole app. Without this, a throw (e.g. a malformed cached
 * profile hitting `.toLowerCase()`) unmounts the entire React tree.
 */
class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the crash visible in the console/telemetry for debugging.
    console.error("ErrorBoundary caught an error", error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          p: 4,
          height: "100%",
          textAlign: "center",
        }}
      >
        <Typography variant="h6">Something went wrong</Typography>
        <Typography variant="body2" color="text.secondary">
          This part of the app hit an unexpected error. You can try again or
          reload.
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" onClick={this.reset}>
            Try again
          </Button>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </Box>
      </Box>
    );
  }
}

export default ErrorBoundary;
