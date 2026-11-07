import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');

if (!existsSync(distDir)) {
  console.error(`Dist directory not found at ${distDir}. Run vite build first.`);
  process.exit(1);
}

const htmlFiles = readdirSync(distDir).filter((file) => file.endsWith('.html'));

if (htmlFiles.length === 0) {
  console.error('No HTML files found in dist directory.');
  process.exit(1);
}

console.log(`Checking internal links across ${htmlFiles.length} HTML files in dist/ ...`);

let errorCount = 0;
let checkedCount = 0;

// Base path pattern to strip if present
const base = process.env.SITE_BASE || '/mindspace/';

function extractIds(html) {
  const ids = new Set();
  const idRegex = /\sid=["']([^"']+)["']/gi;
  let match;
  while ((match = idRegex.exec(html)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

function extractLinks(html) {
  const links = [];
  const anchorRegex = /<a\s+([^>]*?)>/gi;
  let match;
  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = match[1];
    const hrefMatch = /\bhref=["']([^"']*)["']/i.exec(attrs);
    const ariaDisabled = /\baria-disabled=["']true["']/i.test(attrs);
    const hasAppLink = /\bdata-app-link=/i.test(attrs);
    if (hrefMatch) {
      links.push({ href: hrefMatch[1], ariaDisabled, hasAppLink, raw: match[0] });
    } else {
      links.push({ href: null, ariaDisabled, hasAppLink, raw: match[0] });
    }
  }
  return links;
}

// Map files and their IDs
const fileIdMap = new Map();
for (const file of htmlFiles) {
  const content = readFileSync(join(distDir, file), 'utf-8');
  fileIdMap.set(file, { content, ids: extractIds(content) });
}

for (const file of htmlFiles) {
  const { content, ids } = fileIdMap.get(file);
  const links = extractLinks(content);

  for (const { href, ariaDisabled, hasAppLink, raw } of links) {
    // If element has no href, check if it's an intentionally disabled app link
    if (href === null) {
      if (hasAppLink && ariaDisabled) {
        checkedCount++;
        continue;
      }
      console.error(`[FAIL] ${file}: Anchor without href attribute: ${raw}`);
      errorCount++;
      continue;
    }

    // Dead link check
    if (href === '#' || href === '') {
      console.error(`[FAIL] ${file}: Found empty or dead anchor link href="${href}"`);
      errorCount++;
      continue;
    }

    // External link
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
      checkedCount++;
      continue;
    }

    // Anchor on same page
    if (href.startsWith('#')) {
      const targetId = href.slice(1);
      if (!ids.has(targetId)) {
        console.error(`[FAIL] ${file}: Anchor link "${href}" points to non-existent id="${targetId}"`);
        errorCount++;
      } else {
        checkedCount++;
      }
      continue;
    }

    // Relative or base-prefixed link to another page
    let normalized = href;
    if (normalized.startsWith(base)) {
      normalized = normalized.slice(base.length);
    }
    if (normalized.startsWith('./')) {
      normalized = normalized.slice(2);
    }
    if (normalized.startsWith('/')) {
      normalized = normalized.slice(1);
    }

    const [pathPart, hashPart] = normalized.split('#');
    const targetFile = pathPart === '' ? 'index.html' : pathPart;

    if (!existsSync(join(distDir, targetFile))) {
      console.error(`[FAIL] ${file}: Link href="${href}" -> target file "${targetFile}" does not exist in dist/`);
      errorCount++;
    } else {
      if (hashPart) {
        const targetIds = fileIdMap.get(targetFile)?.ids;
        if (targetIds && !targetIds.has(hashPart)) {
          console.error(`[FAIL] ${file}: Link href="${href}" -> id="${hashPart}" not found in "${targetFile}"`);
          errorCount++;
        } else {
          checkedCount++;
        }
      } else {
        checkedCount++;
      }
    }
  }
}

if (errorCount > 0) {
  console.error(`\nLink verification failed with ${errorCount} error(s). (${checkedCount} links passed)`);
  process.exit(1);
}

console.log(`\nAll ${checkedCount} internal and page links verified successfully. No broken or dead links found.`);
