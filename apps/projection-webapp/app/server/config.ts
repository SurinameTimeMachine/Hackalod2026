// Committed config, no secrets. Env vars override for quick testing; the
// OpenAI key only ever comes from .env (repo root, loaded by next.config.ts).
export const MODELS = {
  transcribe: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
  text: process.env.OPENAI_TEXT_MODEL || 'gpt-5.4-mini', // vision + structured outputs
};

// Archive reads go through the public proxy, so no Tailscale is needed.
export const ARCHIVE = process.env.ARCHIVE_BASE || 'https://hackalod.sbco.design/api/suriname_person_search';

// Saved stories: the contributions database next to the archive, written
// through its canned write queries (add_story, add_story_entities,
// add_story_contributions), public for the hackathon.
export const CONTRIBUTIONS = process.env.CONTRIBUTIONS_BASE || 'https://hackalod.sbco.design/api/contributions';

export const LIMITS = {
  uploadBytes: 10 * 1024 * 1024,
  transcriptChars: 5000,
  perMinute: 20, // story requests per IP
};
