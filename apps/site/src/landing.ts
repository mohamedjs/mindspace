// Landing page: Arabic by default, English on the toggle (or for an English browser).
// The Arabic copy lives in index.html; this file holds the English and swaps it in.
type Lang = 'ar' | 'en';

const en: Record<string, string> = {
  'nav.skip': 'Skip to content',
  'nav.video': 'Video',
  'nav.features': 'Features',
  'nav.claude': 'Claude & MCP',
  'nav.faq': 'FAQ',
  'hero.tag': 'Type or talk, we sort the rest',
  'hero.title': 'Think out loud. MindSpace sorts it out.',
  'hero.lead': 'MindSpace turns what you type or say into sticky notes on a canvas: ideas, tasks with dates, questions, each note linked to the one it came from. And it connects to Claude over MCP, so Claude can build and read your board itself.',
  'hero.watch': 'Watch the video',
  'hero.mcp': 'Connect Claude',
  'notes.idea.t': 'Trip to Alexandria',
  'notes.idea.c': 'With my sister, this weekend',
  'notes.task.t': 'Book the train',
  'notes.task.c': 'Friday morning, 9:00',
  'notes.q.t': 'Visit the museum?',
  'notes.q.c': 'Or save the money?',
  'notes.d.t': 'Hotel on the Corniche',
  'notes.d.c': 'Agreed',
  'video.caption': 'Two minutes: the in-app chat, Claude building a whole board over MCP, the views and the settings. Everything in it is filmed from the real app. (Narration in Egyptian Arabic.)',
  'features.title': 'Everything you need so ideas stop getting lost',
  'f.chat.t': 'Type or talk',
  'f.chat.c': 'Say it the way it comes, in Arabic or English. The AI splits it into notes: idea, task, question, decision.',
  'f.views.t': 'Four ways to see it',
  'f.views.c': 'The same notes on a Canvas you arrange by hand, a Mind Map, a List or a Calendar.',
  'f.dates.t': 'It understands dates',
  'f.dates.c': '"Tomorrow morning" or "Saturday" becomes a date on the note, shows up in the Calendar, and you get a reminder before it.',
  'f.mcp.t': 'Connected to Claude',
  'f.mcp.c': 'Over MCP: ask Claude for a plan or to sort your thoughts, and it builds the board itself in one step.',
  'f.models.t': 'Pick your model',
  'f.models.c': 'On paid plans, choose any OpenRouter model for writing and for voice.',
  'f.phone.t': 'On your phone too',
  'f.phone.c': 'The same app in your phone browser, laid out for a small screen.',
  'mcp.title': 'Connect Claude in three steps',
  'mcp.sub': 'Claude does the thinking and writes the notes, so it uses none of your MindSpace credits.',
  'mcp.s1.t': 'Create a token',
  'mcp.s1.c': 'In Settings, under Connect AI assistants, press Create token.',
  'mcp.s2.t': 'Copy the config',
  'mcp.s2.c': 'The page gives you ready-to-paste configs for Claude Code, Claude Desktop and Cursor.',
  'mcp.s3.t': 'Ask for what you need',
  'mcp.s3.c': '"Plan the launch of my bakery" or "What do I have to finish this week?". Claude reads and writes your board.',
  'flow.you': 'You',
  'flow.mcp': 'MCP server',
  'flow.board': 'Your board',
  'faq.title': 'FAQ',
  'faq.q1': 'Does it understand Egyptian Arabic?',
  'faq.a1': 'Yes. Type or speak in Egyptian Arabic, English or both, and the notes come out in the language you used.',
  'faq.q2': 'Does Claude spend my credits?',
  'faq.a2': 'No. When Claude writes over MCP, the notes are saved exactly as it sends them, without MindSpace running its own AI.',
  'faq.q3': 'Which assistants can I connect?',
  'faq.a3': 'Anything that speaks MCP over HTTP, such as Claude Code, Claude Desktop and Cursor. Settings gives you the config ready to copy.',
  'faq.q4': 'What can a token do?',
  'faq.a4': 'Read and write your spaces and notes, nothing more. It cannot change your account, payments or keys, and you can revoke it any time.',
  'foot.privacy': 'Privacy',
  'foot.terms': 'Terms',
};

const ar: Record<string, string> = {};
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { ar[el.dataset.i18n!] = el.textContent ?? ''; });
const arTitle = document.title;

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('mindspace_lang');
    if (saved === 'ar' || saved === 'en') return saved;
  } catch { /* storage blocked: fall through */ }
  return (navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function apply(lang: Lang): void {
  const dict = lang === 'ar' ? ar : en;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = lang === 'ar' ? arTitle : 'MindSpace: think out loud, get sticky notes';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const v = dict[el.dataset.i18n!];
    if (v) el.textContent = v;
  });
  const btn = document.getElementById('lang')!;
  const other = lang === 'ar' ? 'English' : 'العربية';
  btn.textContent = other;
  btn.setAttribute('aria-label', other);
  btn.setAttribute('title', other);
  try { localStorage.setItem('mindspace_lang', lang); } catch { /* ignore */ }
}

let lang = initialLang();
apply(lang);
document.getElementById('lang')!.addEventListener('click', () => { lang = lang === 'ar' ? 'en' : 'ar'; apply(lang); });

// If the video file is missing (404), hide the section instead of showing a broken player.
const video = document.querySelector('video');
video?.querySelector('source')?.addEventListener('error', () => { document.getElementById('video')!.hidden = true; });
