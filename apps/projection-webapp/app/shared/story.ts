// Shapes shared by the phone (/scan) and the story routes (/story/*).

// A name the visitor may have scanned: from a screen (display registry) or,
// when it is on no screen, from the archive search.
export type Candidate = {
  key: string;
  certain?: boolean; // scanned from a screen: the record is the stamp itself
  text: string;
  font?: string; // stamp font + ink, when it came from a screen
  color?: string;
  subtitle?: string;
};

export type ScanResult = {
  source: 'display' | 'search' | 'none';
  read_text: string;
  candidates: Candidate[]; // best first
};

// What the archive says about one key: shown on the "found" card, and the
// context for transcription hints and extraction.
export type PersonContext = {
  key: string;
  name: string;
  surname: string | null; // for searching relatives told by first name only
  facts: { label: string; value: string }[];
  birthYear: number | null;
  related: { key: string; name: string; role: string | null; year: number | null; dataset: string | null }[];
  places: string[];
};

// One thing recognised in the story (NER), and where it lands in the
// contributions dataset if it can: `kind` null means recognised but not
// stored. `mention` is the exact words in the transcript (for highlighting),
// `quote` the sentence it came from.
export type Suggestion = {
  mention: string;
  type: 'person' | 'place' | 'date' | 'occupation' | 'relation' | 'organisation' | 'other';
  about: string | null; // "subject", "narrator" or another person's name
  is_subject: boolean; // this person is the scanned person themselves
  kind: 'relation' | 'fact' | 'place' | 'date' | null;
  relation_type: string | null;
  related_key: string | null;
  name_raw: string | null;
  field: string | null;
  value: string | null;
  place_raw: string | null;
  year: number | null;
  quote: string;
  possibly_living: boolean;
  life: LifeFacts; // for persons: what the story says about their life
};

export type Range = [number, number];

// What a story says about when/where someone lived (for filtering records).
export type LifeFacts = { born: number | null; died: number | null; alive_in: number | null; place: string | null };

// An archive match offered for a suggestion's place or person. People carry
// their possible lifetime and place, for the follow-up questions.
export type MatchOption = { id: string; label: string; detail: string; born?: Range | null; died?: Range | null; place?: string | null };

export type ResolvedSuggestion = Suggestion & {
  id: string;
  category: 'per' | 'pla' | 'dat' | 'rol' | 'rel' | 'oth'; // colour in the UI
  options: MatchOption[]; // archive matches to pick from (place_norm or person key)
  linked: string | null; // the archive key/place this already points to, if any
  linkedLabel: string | null;
};

// Is the chosen person the one the story is about? 'check': the record does
// not fit the story (or none was chosen): ask, with the records that do fit.
export type SubjectCheck = { status: 'ok' | 'check' | 'none'; reason: string | null; options: MatchOption[] };

export type ExtractResult = { summary: string; suggestions: ResolvedSuggestion[]; subject: SubjectCheck };
