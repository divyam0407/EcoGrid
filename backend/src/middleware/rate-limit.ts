import { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };

/** Per-process safety limit. Production deployments should also enforce distributed limits at the API gateway. */
export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  const buckets = new Map<string, Bucket>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${req.path}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (buckets.size > 10000) {
      for (const [candidate, value] of buckets) if (value.resetAt <= now) buckets.delete(candidate);
    }
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: options.message || 'Too many requests. Try again later.' });
    }
    return next();
  };
}
