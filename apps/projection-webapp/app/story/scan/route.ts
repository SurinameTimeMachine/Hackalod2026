// POST /story/scan: which name is this? multipart `image` (a photo of the
// wall, downscaled on the phone) or `text` (typed). Matches the names on the
// active screens first, then falls back to the archive search.
import { LIMITS } from '../../server/config';
import { failed, limited, modelOverride } from '../../server/guard';
import { scanImage, scanText } from '../../server/story';

export async function POST(request: Request) {
  const block = limited(request);
  if (block) return block;
  const form = await request.formData().catch(() => null);
  const image = form?.get('image');
  const text = form?.get('text');
  try {
    if (image instanceof Blob) {
      if (image.size > LIMITS.uploadBytes) return Response.json({ error: 'image too large' }, { status: 413 });
      return Response.json(await scanImage(image, modelOverride(request)));
    }
    if (typeof text === 'string' && text.trim().length >= 2) return Response.json(await scanText(text.trim().slice(0, 100)));
    return Response.json({ error: 'send an image or a text of at least 2 characters' }, { status: 400 });
  } catch (e) {
    return failed('story/scan', e);
  }
}
