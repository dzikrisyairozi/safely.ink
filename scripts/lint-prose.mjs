// Checks Markdown prose for the signs of machine-written text that the docs
// are written against (docs/ROADMAP.md, "How we write"). Code, URLs and
// front matter are skipped. Usage: node scripts/lint-prose.mjs <file|dir>...
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORDS = [
  'additionally',
  'boasts',
  'bolstered',
  'crucial',
  'deep dive',
  'delve',
  'enduring',
  'foster',
  'garner',
  'groundbreaking',
  'interplay',
  'intricate',
  'leverage',
  'meticulous',
  'multifaceted',
  'nestled',
  'pivotal',
  'renowned',
  'robust',
  'seamless',
  'showcase',
  'tapestry',
  'testament',
  'underscore',
  'vibrant',
];

const CHECKS = [
  { name: 'dash', pattern: /[–—]/ },
  { name: 'curly quote', pattern: /[‘’“”]/ },
  { name: 'semicolon', pattern: /;/ },
  { name: 'tracking parameter', pattern: /[?&]utm_/ },
  {
    name: 'chatbot artifact',
    pattern: /contentReference|oaicite|oai_citation|\[cite: ?\d+\]|grok_card/,
  },
  {
    name: 'banned word',
    pattern: new RegExp(`\\b(${WORDS.join('|')})\\w*`, 'i'),
  },
];

function markdownFiles(path) {
  if (statSync(path).isFile()) return path.endsWith('.md') ? [path] : [];
  return readdirSync(path)
    .sort()
    .flatMap((name) => markdownFiles(join(path, name)));
}

// Names that are spelled with a banned character.
const NAMES = /ToS;DR/g;

// The line as prose: inline code, links' targets, bare URLs and names removed.
const prose = (line) =>
  line
    .replace(NAMES, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\/\/\S+/g, '');

let problems = 0;
for (const file of process.argv.slice(2).flatMap(markdownFiles)) {
  let fenced = false;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, n) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return;
      const text = prose(line);
      // A tracking parameter is looked for in the URLs too.
      for (const { name, pattern } of CHECKS) {
        const match = (name === 'tracking parameter' ? line : text).match(
          pattern,
        );
        if (!match) continue;
        problems += 1;
        console.log(`${file}:${n + 1}: ${name} "${match[0]}"`);
      }
    });
}

if (problems > 0) {
  console.log(`${problems} problems`);
  process.exit(1);
}
