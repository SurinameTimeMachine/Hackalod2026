// The only place that talks to OpenAI. Plain fetch, no SDK. Each task is one
// function, so the provider can be swapped without touching the routes.
import { MODELS } from './config';

const BASE = 'https://api.openai.com/v1';

function key() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error('OPENAI_API_KEY is not set (.env in the repo root)');
  return k;
}

type Content = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' } })[];

// One chat call with strict JSON-schema output, parsed.
export async function chatJson<T>(opts: { system: string; user: Content; name: string; schema: object; model?: string }): Promise<T> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model ?? MODELS.text,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: opts.name, strict: true, schema: opts.schema } },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  if (msg?.refusal) throw new Error(`openai refused: ${msg.refusal}`);
  return JSON.parse(msg?.content ?? 'null') as T;
}

// Speech to text. `prompt` carries names and places so they are spelled right.
export async function transcribe(audio: Blob, filename: string, prompt: string, model?: string): Promise<string> {
  const form = new FormData();
  form.append('file', audio, filename);
  form.append('model', model ?? MODELS.transcribe);
  form.append('language', 'nl');
  form.append('response_format', 'json');
  if (prompt) form.append('prompt', prompt);
  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()).text ?? '').trim();
}
