/** Expected, user-facing errors (validation, workflow rules, not found). */
export class UserError extends Error {
  constructor(
    message: string,
    public code: string = "INVALID",
  ) {
    super(message);
  }
}
