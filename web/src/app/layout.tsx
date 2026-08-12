import type { Metadata } from 'next';
import { architectsDaughter, baloo } from './fonts';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'MindSpace',
  description: 'Talk. Get organised thoughts.',
};

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var savedTheme = localStorage.getItem('mindspace:theme');
    var theme = 'dark';
    if (savedTheme === 'light' || savedTheme === 'dark') {
      theme = savedTheme;
    } else if (savedTheme === 'system' || !savedTheme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
    var savedHand = localStorage.getItem('mindspace:handdrawn');
    if (savedHand === '1' || savedHand === null) {
      document.documentElement.setAttribute('data-hand', '1');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${baloo.variable} ${architectsDaughter.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-canvas text-ink min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
