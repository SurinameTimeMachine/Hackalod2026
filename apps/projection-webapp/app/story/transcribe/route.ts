// POST /story/transcribe: multipart `audio` + `key`. The names and places
// around the person go along as a spelling hint. Audio is not stored.
import { buildContext } from '../../server/archive';
import { LIMITS } from '../../server/config';
import { failed, limited, modelOverride } from '../../server/guard';
import { transcribe } from '../../server/openai';
import { transcriptionPrompt } from '../../server/story';

const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a' };

export async function POST(request: Request) {
  const block = limited(request);
  if (block) return block;
  const form = await request.formData().catch(() => null);
  const audio = form?.get('audio');
  const key = String(form?.get('key') ?? '');
  if (!(audio instanceof Blob) || !audio.size) return Response.json({ error: 'audio: required' }, { status: 400 });
  if (audio.size > LIMITS.uploadBytes) return Response.json({ error: 'audio too large' }, { status: 413 });
  const ext = EXT[audio.type.split(';')[0]] ?? 'webm';
  try {
    const ctx = await buildContext(key).catch(() => null);
    const transcript = await transcribe(audio, `story.${ext}`, transcriptionPrompt(ctx, String(form?.get('name') ?? '').slice(0, 120) || undefined), modelOverride(request));
    return Response.json({ transcript });
  } catch (e) {
    return failed('story/transcribe', e);
  }
}
