// Shared authorisation for the scheduled cron route handlers. Accepts the
// CRON_SECRET via an Authorization bearer header or a ?secret= query param.
export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}
