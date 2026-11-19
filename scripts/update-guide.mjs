import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUIDE_URL = 'https://tvonline.to/program-tv/';
const GUIDE_FILE = new URL('../guide.json', import.meta.url);

const namedEntities = {
  amp: '&',
  apos: "'",
  nbsp: ' ',
  quot: '"',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
  middot: '·',
  acirc: 'â',
  Acirc: 'Â',
  abreve: 'ă',
  Abreve: 'Ă',
  icirc: 'î',
  Icirc: 'Î',
  sacute: 'ş',
  Sacute: 'Ş',
  tcedil: 'ţ',
  Tcedil: 'Ţ'
};

function decodeHtml(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z0-9]+);/gi, (entity, name) => {
    if (name.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }
    if (name.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    }
    return namedEntities[name] ?? entity;
  });
}

function textContent(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function classBlock(row, tag, className, nextClass) {
  const start = `<${tag}\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`;
  const end = nextClass
    ? `(?=<${tag}\\b[^>]*class=["'][^"']*\\b${nextClass}\\b)`
    : `</${tag}>`;
  const match = new RegExp(`${start}([\\s\\S]*?)${end}`, 'i').exec(row);
  return match?.[1] ?? '';
}

function firstStrongText(value) {
  const match = /<strong\b[^>]*>([\s\S]*?)<\/strong>/i.exec(value);
  return textContent(match?.[1] ?? value);
}

function firstTimeText(value) {
  const match = /<time\b[^>]*>([\s\S]*?)<\/time>/i.exec(value);
  return textContent(match?.[1] ?? '');
}

export function normalizeGuideName(value) {
  return value.normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(?:hd|fhd|4k)$/i, '');
}

export function cleanGuideTitle(value) {
  const title = value.replace(/\s+/g, ' ').trim();
  const parts = title.split(/\s+[–—-]\s+/, 2);
  if (parts.length !== 2) {
    return title;
  }
  const comparisonKey = part => part.normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const first = comparisonKey(parts[0]);
  return first && first === comparisonKey(parts[1]) ? parts[0].trim() : title;
}

export function parseGuide(html) {
  const programs = {};
  const rows = html.matchAll(/<article\b[^>]*class=["'][^"']*\btvguide-row\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi);

  for (const [, row] of rows) {
    const channel = firstStrongText(classBlock(row, 'a', 'tvguide-channel'));
    const currentBlock = classBlock(row, 'div', 'tvguide-current', 'tvguide-next');
    const nextBlock = classBlock(row, 'div', 'tvguide-next', 'tvguide-actions');
    const interval = firstTimeText(currentBlock).match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
    const nextStart = firstTimeText(nextBlock).match(/\d{1,2}:\d{2}/)?.[0] ?? '';
    const current = cleanGuideTitle(firstStrongText(currentBlock));
    const next = cleanGuideTitle(firstStrongText(nextBlock));
    const key = normalizeGuideName(channel);

    if (!key || !current) {
      continue;
    }
    programs[key] = {
      channel,
      current,
      start: interval?.[1] ?? '',
      end: interval?.[2] ?? '',
      next,
      nextStart
    };
  }

  return programs;
}

export async function refreshGuide() {
  const response = await fetch(GUIDE_URL, {
    headers: { 'User-Agent': 'RazvanTV-Web/1.3 TV guide refresh' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new Error(`TVOnline.to returned HTTP ${response.status}`);
  }

  const programs = parseGuide(await response.text());
  if (Object.keys(programs).length < 25) {
    throw new Error(`TVOnline.to returned too few guide entries (${Object.keys(programs).length})`);
  }

  const sortedPrograms = Object.fromEntries(
    Object.entries(programs).sort(([first], [second]) => first.localeCompare(second))
  );
  const contents = `${JSON.stringify({
    source: 'TVOnline.to',
    refreshMinutes: 15,
    programs: sortedPrograms
  }, null, 2)}\n`;

  let previous = '';
  try {
    previous = await readFile(GUIDE_FILE, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  if (previous === contents) {
    console.log(`TV guide is unchanged (${Object.keys(sortedPrograms).length} channels).`);
    return;
  }

  await writeFile(GUIDE_FILE, contents);
  console.log(`Updated TV guide with ${Object.keys(sortedPrograms).length} channels.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshGuide().catch(error => {
    console.error('Could not refresh the TV guide:', error);
    process.exitCode = 1;
  });
}
