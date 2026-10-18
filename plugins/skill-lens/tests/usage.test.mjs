import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countClaude, countCodex, countCursor, locateSkill } from '../lib/usage.ts';
import { buildCards, cardUsage, rankCards, tildePath, usageLabel } from '../lib/cards.ts';

const locate = locateSkill('/h', (path) => path.replace('/h/.agents/skills/', '/h/agent-config/'));

test('counts claude skill tool uses once per id and maps bb plugin skills', () => {
  const lines = [
    '{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"pr-visual"}},{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"bb-global-skills:inline-vis"}}]}',
    '{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"pr-visual"}}]}',
    '{"type":"user","message":{"content":"<command-message>pr-visual</command-message>\\n<command-name>/pr-visual</command-name>"},"uuid":"u1"}',
    '{"type":"user","message":{"content":"<command-message>pr-visual</command-message>\\n<command-name>/pr-visual</command-name>"},"uuid":"u1"}',
    '{"type":"user","message":{"content":"<command-message>grill-me</command-message>\\n<command-name>/grill-me</command-name>"},"uuid":"u2"}',
  ];
  assert.deepEqual(countClaude(lines), { 'pr-visual': 2, 'bb:inline-vis': 1, 'grill-me': 1 });
});

test('counts codex skill reads and mentions once per session by resolved folder', () => {
  const sessions = [
    {
      session: 'a.jsonl',
      lines: [
        '{"payload":{"type":"function_call","arguments":"cat ~/.agents/skills/research/SKILL.md"}}',
        '{"payload":{"type":"function_call","arguments":"sed -n 1,80p /h/.agents/skills/research/SKILL.md"}}',
        '{"payload":{"type":"message","content":"<skill>\\n<name>research</name>"}}',
        '{"payload":{"type":"message","content":"available: /x/catalog-only/SKILL.md"}}',
      ],
    },
    {
      session: 'b.jsonl',
      lines: ['{"payload":{"type":"local_shell_call","command":"cat skills/caveman-uk/SKILL.md\\n/h/.bb/runtime/global-skills/abc/skills/bb-cli/SKILL.md"}}'],
    },
    { session: 'c.jsonl', lines: ['{"payload":{"type":"message","content":"<skill>\\n<name>grill-me</name>"}}'] },
  ];
  assert.deepEqual(countCodex(sessions, locate), { '/h/agent-config/research': 1, 'caveman-uk': 1, 'bb:bb-cli': 1, 'grill-me': 1 });
});

test('counts cursor assistant skill reads once per chat', () => {
  const read = (path) => JSON.stringify({ role: 'assistant', content: [{ type: 'tool-call', toolName: 'Read', args: { path } }] });
  const chats = [
    { chat: 'a', blobs: [read('/h/.cursor/skills-cursor/create-rule/SKILL.md'), read('/h/.cursor/skills-cursor/create-rule/SKILL.md'), 'not json'] },
    { chat: 'b', blobs: [read('/h/.cursor/skills-cursor/create-rule/SKILL.md'), JSON.stringify({ role: 'user', content: [] })] },
  ];
  assert.deepEqual(countCursor(chats, locate), { '/h/.cursor/skills-cursor/create-rule': 2 });
});

const entry = (overrides) => ({
  id: overrides.id,
  name: overrides.name,
  description: null,
  provider: null,
  pluginId: null,
  root: `/h/.claude/skills/${overrides.name}`,
  realRoot: `/h/.claude/skills/${overrides.name}`,
  ...overrides,
});

test('merges entries by plugin and name, keeps every provider and sorts by name', () => {
  const cards = buildCards(
    [
      entry({ id: '1', name: 'research', provider: 'codex', root: '/h/.codex/skills/research', description: 'Research.' }),
      entry({ id: '2', name: 'research', provider: 'claude-code' }),
      entry({ id: '3', name: 'inline-vis', pluginId: 'inline-vis', root: '/p/inline-vis/skills/inline-vis' }),
    ],
    '/h',
  );
  assert.deepEqual(
    cards.map((card) => [card.name, card.source, card.providers, card.entries.length, card.description]),
    [
      ['inline-vis', 'plugin · inline-vis', [null], 1, null],
      ['research', '~/.codex/skills', ['codex', 'claude-code'], 2, 'Research.'],
    ],
  );
});

test('adds usage by folder, bb plugin key or name and marks estimates', () => {
  const usage = {
    claude: { research: 3, 'bb:pdf': 2, 'product-design:research': 5 },
    codex: { '/h/.claude/skills/research': 4, research: 1, pdf: 6 },
    cursor: { '/h/.cursor/skills/pdf': 1 },
  };
  const [pdf, design, research] = buildCards(
    [
      entry({ id: '1', name: 'pdf', pluginId: 'pdf' }),
      entry({ id: '2', name: 'product-design:research', pluginId: 'product-design', provider: 'claude-code', root: '/p/research', realRoot: '/p/research' }),
      entry({ id: '3', name: 'research', provider: 'claude-code' }),
    ],
    '/h',
  );
  assert.deepEqual(cardUsage(research, usage), { count: 7, approximate: true });
  assert.deepEqual(cardUsage(design, usage), { count: 5, approximate: false });
  assert.deepEqual(cardUsage(pdf, usage), { count: 8, approximate: true });
  assert.equal(usageLabel({ count: 1, approximate: false }), '1 usage');
  assert.equal(usageLabel({ count: 40, approximate: true }), '~40 usages');
  assert.equal(tildePath('/home2/x', '/home'), '/home2/x');
});

test('ranks cards by usage and keeps name order on ties', () => {
  const cards = buildCards(
    [entry({ id: '1', name: 'alpha', provider: 'claude-code' }), entry({ id: '2', name: 'beta', provider: 'claude-code' }), entry({ id: '3', name: 'gamma', provider: 'claude-code' })],
    '/h',
  );
  const usage = { claude: { gamma: 4, beta: 1 }, codex: {}, cursor: {} };
  assert.deepEqual(rankCards(cards, usage).map((card) => card.name), ['gamma', 'beta', 'alpha']);
  assert.deepEqual(rankCards(cards, { claude: { alpha: 2, gamma: 2 }, codex: {}, cursor: {} }).map((card) => card.name), ['alpha', 'gamma', 'beta']);
});
