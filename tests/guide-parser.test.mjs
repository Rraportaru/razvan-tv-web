import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanGuideTitle, normalizeGuideName, parseGuide } from '../scripts/update-guide.mjs';

test('parses current and next entries from the aggregate guide', () => {
  const html = `
    <article class="tvguide-row">
      <a class="tvguide-channel"><span><strong>HBO 2</strong></span></a>
      <div class="tvguide-current">
        <div class="tvguide-meta"><time>22:25 – 00:20</time></div>
        <a><strong>The Bikeriders: Clubul Vandalilor – The Bikeriders: Clubul Vandalilor</strong></a>
      </div>
      <div class="tvguide-next"><time>00:20</time><strong>The Monkey: Blestemul</strong></div>
      <div class="tvguide-actions"></div>
    </article>`;

  assert.deepEqual(parseGuide(html).hbo2, {
    channel: 'HBO 2',
    current: 'The Bikeriders: Clubul Vandalilor',
    start: '22:25',
    end: '00:20',
    next: 'The Monkey: Blestemul',
    nextStart: '00:20'
  });
});

test('normalizes Romanian channel names and preserves distinct title pairs', () => {
  assert.equal(normalizeGuideName('Acasă TV HD'), 'acasatv');
  assert.equal(cleanGuideTitle('The Bikeriders – The Bikeriders'), 'The Bikeriders');
  assert.equal(cleanGuideTitle('Dune – Dune: Part Two'), 'Dune – Dune: Part Two');
});
