import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rememberTier, tierStorageKey } from '../tier-memory.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const key = tierStorageKey('fast-mode-memory', 'thread-a', 'codex', 'model-a');
function fixture(entries = []) {
  const values = new Map(entries);
  const errors = [];
  const storage = {
    getItem: k => values.get(k) ?? null,
    setItem: (k, value) => values.set(k, value),
  };
  return { values, errors, storage, report: error => errors.push(error) };
}

test('Fast survives navigation and reload without a submitted message; off survives too', async () => {
  const f = fixture();
  let applied = [];
  let memory = rememberTier({ ...f, key, current: 'default', apply: async tier => { applied.push(tier); return tier; } });
  memory.observe('default');
  assert.equal(f.values.has(key), false, 'mount does not store server defaults');
  memory.observe('fast');
  memory.dispose();
  memory = rememberTier({ ...f, key, current: 'default', apply: async tier => { applied.push(tier); return tier; } });
  memory.observe('default');
  await tick();
  assert.deepEqual(applied, ['fast']);
  assert.equal(f.values.get(key), 'fast');
  memory.observe('fast');
  memory.observe('default');
  memory.dispose();
  memory = rememberTier({ ...f, key, current: 'fast', apply: async tier => { applied.push(tier); return tier; } });
  await tick();
  assert.deepEqual(applied, ['fast', 'default']);
  assert.equal(f.values.get(key), 'default');
});

test('thread, model, provider and plugin choices are independent', async () => {
  const f = fixture([[key, 'fast']]);
  let calls = 0;
  for (const otherKey of [
    tierStorageKey('fast-mode-memory', 'thread-b', 'codex', 'model-a'),
    tierStorageKey('fast-mode-memory', 'thread-a', 'codex', 'model-b'),
    tierStorageKey('fast-mode-memory', 'thread-a', 'claude', 'model-a'),
    tierStorageKey('other-plugin', 'thread-a', 'codex', 'model-a'),
  ]) {
    rememberTier({ ...f, key: otherKey, current: 'default', apply: async tier => { calls++; return tier; } });
  }
  await tick();
  assert.equal(calls, 0);
});

test('a user can turn Fast off while restoration is finishing', async () => {
  const f = fixture([[key, 'fast']]);
  let finish;
  const memory = rememberTier({ ...f, key, current: 'default', apply: () => new Promise(resolve => { finish = resolve; }) });
  await tick();
  memory.observe('fast');
  memory.observe('default');
  finish('fast');
  await tick();
  assert.equal(f.values.get(key), 'default');
});

test('unmount cancels pending restoration and stale observations cannot write', async () => {
  const f = fixture([[key, 'fast']]);
  let calls = 0;
  const memory = rememberTier({ ...f, key, current: 'default', apply: async tier => { calls++; return tier; } });
  memory.dispose();
  memory.observe('default');
  await tick();
  assert.equal(calls, 0);
  assert.equal(f.values.get(key), 'fast');
});

test('unsupported tiers do not destroy a saved preference', async () => {
  const f = fixture([[key, 'fast']]);
  const memory = rememberTier({ ...f, key, current: 'default', apply: async () => 'default' });
  await tick();
  memory.observe('default');
  assert.equal(f.values.get(key), 'fast');
});

test('corrupt storage and storage/restore failures leave the native composer usable', async () => {
  const f = fixture([[key, '{corrupt']]);
  let calls = 0;
  const memory = rememberTier({ ...f, key, current: 'default', apply: async tier => { calls++; return tier; } });
  await tick();
  assert.equal(calls, 0);
  memory.observe('fast');
  assert.equal(f.values.get(key), 'fast');

  const errors = [];
  const blocked = rememberTier({ key, current: 'default', storage: {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('quota'); },
  }, apply: async tier => tier, report: e => errors.push(e) });
  blocked.observe('fast');
  assert.equal(errors.length, 2);
  const rejected = rememberTier({ ...f, key, current: 'default', apply: async () => { throw new Error('picker unavailable'); } });
  await tick();
  assert.equal(f.errors.length, 1);
  rejected.observe('fast');
  rejected.observe('default');
  assert.equal(f.values.get(key), 'default');
});
