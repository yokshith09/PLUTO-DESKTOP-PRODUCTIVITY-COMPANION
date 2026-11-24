import { handle, rollUp, type Env } from "./api";

/** The Worker: requests go to `handle`; the daily cron folds old records into totals. */
export default {
  fetch: (req: Request, env: Env) => handle(req, env),
  scheduled: async (_event: unknown, env: Env) => rollUp(env.DB, new Date()),
};
