import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disableHook, getHookEntries, restoreHook, serializeJson } from '../lib/hooks-json.ts';
import { getCodexHookKey, isCodexHookEnabled, setCodexHookEnabled } from '../lib/codex-state.ts';

const settingsRaw = JSON.stringify({
  model: 'opus',
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'a', timeout: 5 }, { type: 'command', command: 'b' }] },
      { matcher: '*', hooks: [{ type: 'command', command: 'c' }] },
    ],
    Stop: [{ hooks: [{ type: 'command', command: 'd' }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: 'e' }] }],
  },
  theme: 'dark',
}, null, 2) + '\n';

const roundTrip = command => {
  const settings = JSON.parse(settingsRaw);
  const entry = getHookEntries(settings.hooks).find(item => item.hook.command === command);
  const stash = disableHook(settings, entry.id);
  const disabledRaw = serializeJson(settingsRaw, JSON.parse(JSON.stringify(settings)));
  assert.equal(disabledRaw.includes(`"command": "${command}"`), false);
  const reloaded = JSON.parse(disabledRaw);
  restoreHook(reloaded, JSON.parse(JSON.stringify(stash)));
  return serializeJson(disabledRaw, reloaded);
};

test('Claude hook disable then restore keeps the file byte-identical', () => {
  for (const command of ['a', 'b', 'c', 'd', 'e']) {
    assert.equal(roundTrip(command), settingsRaw, command);
  }
});

test('Claude disable drops empty group and event keys', () => {
  const settings = JSON.parse(settingsRaw);
  const stopEntry = getHookEntries(settings.hooks).find(item => item.hook.command === 'd');
  const stash = disableHook(settings, stopEntry.id);
  assert.equal('Stop' in settings.hooks, false);
  assert.equal(stash.groupRemoved, true);
  const starEntry = getHookEntries(settings.hooks).find(item => item.hook.command === 'c');
  disableHook(settings, starEntry.id);
  assert.equal(settings.hooks.PreToolUse.length, 1);
});

test('Claude disable rejects a stale id', () => {
  const settings = JSON.parse(settingsRaw);
  assert.throws(() => disableHook(settings, 'PreToolUse:0:0:000000000000'), /refresh/);
});

test('Claude serialize keeps detected indent and missing trailing newline', () => {
  const raw = '{\n    "a": 1\n}';
  assert.equal(serializeJson(raw, JSON.parse(raw)), raw);
});

const hooksPath = '/Users/me/.codex/hooks.json';
const key = getCodexHookKey(hooksPath, 'UserPromptSubmit', 0, 0);
const header = `[hooks.state."${hooksPath}:user_prompt_submit:0:0"]`;
const tomlWithTable = `model = "x"\n\n[hooks.state]\n\n${header}\ntrusted_hash = "sha256:abc"\n\n[features]\nhooks = true\n`;

test('Codex key uses snake_case event names', () => {
  assert.equal(key, `${hooksPath}:user_prompt_submit:0:0`);
  assert.equal(getCodexHookKey(hooksPath, 'PreToolUse', 1, 2), `${hooksPath}:pre_tool_use:1:2`);
});

test('Codex disable then enable on an existing table is byte-identical', () => {
  assert.equal(isCodexHookEnabled(tomlWithTable, key), true);
  const disabled = setCodexHookEnabled(tomlWithTable, key, false);
  assert.equal(disabled, tomlWithTable.replace(`${header}\n`, `${header}\nenabled = false\n`));
  assert.equal(isCodexHookEnabled(disabled, key), false);
  assert.equal(setCodexHookEnabled(disabled, key, true), tomlWithTable);
});

test('Codex disable then enable without a table is byte-identical', () => {
  const toml = 'model = "x"\n\n[features]\nhooks = true\n';
  const disabled = setCodexHookEnabled(toml, key, false);
  assert.equal(disabled, `${toml}\n${header}\nenabled = false\n`);
  assert.equal(isCodexHookEnabled(disabled, key), false);
  assert.equal(setCodexHookEnabled(disabled, key, true), toml);
});

test('Codex enable replaces nothing when already enabled', () => {
  assert.equal(setCodexHookEnabled(tomlWithTable, key, true), tomlWithTable);
});
