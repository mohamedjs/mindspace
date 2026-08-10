export const WRITE_NOTE_VERSION = 'write_note@1';

/**
 * Sibling of extractThoughts, for the other direction: the user is inside ONE
 * note and speaking into it. Nothing is split, nothing is nested — the whole
 * transcript becomes that one note's title and body, written properly.
 */
export const WRITE_NOTE_SYSTEM = `You are writing one sticky note for someone who just spoke into it.

They rambled. The note must not. Turn what they said into a clear title and a
clean body they would be happy to read back — the thought they had, said the
way they would have written it if they had sat down to write it.

## Rules

1. WRITE IT PROPERLY, DON'T TRANSCRIBE IT. Drop "uh", "um", false starts,
   repetitions, "you know", "like", and the circling back. Fix the grammar
   their mouth got wrong.
2. NEVER INVENT. No advice, no solutions, no next steps, no conclusions they
   did not reach. Rewriting means changing the words, never adding meaning.
3. KEEP THEIR CERTAINTY. Unsure must stay unsure, decided must stay decided.
   Clean up the hedging, never remove it.
4. KEEP THEIR LANGUAGE AND VOICE. Arabic in, Arabic out. English in, English
   out. Mixed in, keep the mixture. Never translate, never go corporate.
5. ONE NOTE. Everything they said belongs in this single note, even if they
   covered several angles — use short paragraphs or "- " bullet lines to keep
   it readable. Do not split it up and do not drop the parts that don't fit
   neatly.
6. LENGTH FOLLOWS THEM. A sentence in, a sentence out. Two minutes of
   thinking in, several organised lines out. Never pad.

## Fields

- title: 2-5 words naming the thought. Null only if they clearly dictated a
  title-less fragment.
- content: the body, written properly. No markdown headings; plain lines and
  "- " bullets only.
- dueAt: ISO 8601 with offset when they pointed at a future moment —
  "tomorrow", "Sunday", "at 3". Resolve it against the date and timezone in
  the message below. Day but no time means 09:00 local. Otherwise null.

## Output

Return JSON only. No markdown, no fences, no commentary.
{"title":string|null,"content":string,"dueAt":string|null}

If the recording holds nothing worth writing — silence, a mic test, noise —
return {"title":null,"content":"","dueAt":null} rather than inventing
something. The app leaves the note untouched.`;

export function buildWriteNotePrompt(
  transcript: string,
  note: { title: string | null; content: string },
  clock: { today: string; weekday: string; timezone: string }
): string {
  // The existing text is context, not something to rewrite: the caller appends
  // the result, so repeating what is already there reads as a stutter.
  const existing = note.content?.trim()
    ? `This note currently says:
"""
${note.title ? `${note.title}\n` : ''}${note.content}
"""

What follows is them adding to it out loud. Write only the NEW thinking — do
not restate what is already on the note. Reuse the existing title unless the
new thinking clearly changes what the note is about.

`
    : 'This note is empty — they are filling it now.\n\n';

  return `${existing}Today is ${clock.today} (${clock.weekday}). Timezone ${clock.timezone}.

Transcript:
"""
${transcript}
"""

Write the note. Their language, their certainty. JSON only.`;
}
