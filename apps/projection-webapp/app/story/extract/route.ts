// POST /story/extract { key, transcript }: suggestions mapped onto the
// contributions columns, with archive matches for places and people.
import { LIMITS } from '../../server/config';
import { failed, limited, modelOverride } from '../../server/guard';
import { extract } from '../../server/story';

export async function POST(request: Request) {
  const block = limited(request);
  if (block) return block;
  const body = await request.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key : '';
  const transcript = typeof body?.transcript === 'string' ? body.transcript.trim() : '';
  if (!key || !transcript) return Response.json({ error: 'key and transcript: required' }, { status: 400 });
  if (transcript.length > LIMITS.transcriptChars) return Response.json({ error: 'transcript too long' }, { status: 413 });
  try {
    return Response.json(await extract(key, transcript, modelOverride(request)));
  } catch (e) {
    return failed('story/extract', e);
  }
}
