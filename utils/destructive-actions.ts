export interface ConfirmationResult {
  confirm?: boolean;
}

/**
 * Keep destructive mutations behind one explicit confirmation boundary.
 * Returning false means the callback was not run, so cancellation is invariant.
 */
export function runConfirmedAction(
  result: ConfirmationResult | null | undefined,
  action: () => void
): boolean {
  if (result?.confirm !== true) return false;
  action();
  return true;
}
