// Maps the supervisor/hook status tokens to a human label.
export function statusLabel(status: string): string {
  switch (status) {
    case "working":
      return "working";
    case "tool":
      return "using tool";
    case "needs-input":
      return "needs input";
    case "waiting":
      return "waiting";
    case "exited":
      return "exited";
    case "running":
      return "running";
    default:
      return status;
  }
}
