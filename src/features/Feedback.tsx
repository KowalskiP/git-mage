import { useRepos } from "../store/repos";

/**
 * Top indeterminate progress bar shown while a git operation is in flight
 * (UX #4). Replaces relying solely on the small toolbar busy text.
 */
export function TopProgress() {
  const busy = useRepos((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="progress" role="progressbar" aria-label={busy}>
      <div className="progress__fill" />
    </div>
  );
}

/**
 * Surfaces the current store error as a dismissable toast instead of a
 * truncated toolbar string (UX #4). The toast persists until the user dismisses
 * it or the next action clears the error — errors shouldn't vanish mid-read.
 */
export function Toaster() {
  const error = useRepos((s) => s.error);
  const dismissError = useRepos((s) => s.dismissError);

  if (!error) return null;
  return (
    <div className="toaster">
      <div className="toast toast--error">
        <span className="toast__msg" title={error}>
          {error.split("\n")[0]}
        </span>
        <button className="toast__close" onClick={dismissError} title="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
