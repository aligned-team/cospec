// The exit codes every command answers with. Its own module, not cli.ts: a command imports it, and
// cli.ts's command registry would make each command reach every other one.

/** The uniform exit-code contract (DESIGN §2). */
export const EXIT = {
  success: 0,
  failure: 1,
  blocked: 2,
  softBlocked: 3,
} as const
