// Request guards for the story routes: a simple per-IP rate limit (a public
// URL must not burn the OpenAI budget) and the ?model= override for testing.
import { LIMITS } from './config';

const g = globalThis as { __storyHits?: Map<string, number[]> };
const hits = (g.__storyHits ??= new Map<string, number[]>());

export function limited(request: Request): Response | null {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (recent.length > LIMITS.perMinute) return Response.json({ error: 'too many requests, wait a minute' }, { status: 429 });
  return null;
}

// ?model=<name>: always in dev, in production only with the debug token.
export function modelOverride(request: Request): string | undefined {
  const model = new URL(request.url).searchParams.get('model') || undefined;
  if (!model) return undefined;
  if (process.env.NODE_ENV !== 'production') return model;
  const token = process.env.DEBUG_TOKEN;
  return token && request.headers.get('x-debug-token') === token ? model : undefined;
}

export function failed(where: string, error: unknown) {
  console.error(`${where}:`, error);
  return Response.json({ error: 'processing failed' }, { status: 502 });
}
