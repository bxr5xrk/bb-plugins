import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listSkillFiles, readSkillFile, resolveInside } from '../lib/skill-files.ts';
import { treeRows } from '../lib/file-tree.ts';

const fixture = () => {
  const base = mkdtempSync(join(tmpdir(), 'skill-lens-'));
  const target = join(base, 'target');
  const outside = join(base, 'outside');
  mkdirSync(join(target, 'scripts'), { recursive: true });
  mkdirSync(join(target, 'node_modules', 'pkg'), { recursive: true });
  mkdirSync(join(target, '.venv'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(target, 'SKILL.md'), '# Skill\n');
  writeFileSync(join(target, 'scripts', 'run.py'), 'print(1)\n');
  writeFileSync(join(target, 'node_modules', 'pkg', 'index.js'), '');
  writeFileSync(join(target, '.venv', 'python'), '');
  writeFileSync(join(target, 'logo.png'), Buffer.from([137, 80, 78, 71, 0, 1, 2]));
  writeFileSync(join(outside, 'shared.md'), 'shared\n');
  symlinkSync(join(outside, 'shared.md'), join(target, 'shared.md'));
  symlinkSync(target, join(base, 'skill'));
  return join(base, 'skill');
};

test('lists files through a symlinked root and symlinked files, skipping dependency folders', async () => {
  const { files, truncated } = await listSkillFiles(fixture());
  assert.deepEqual(files.map(file => file.path), ['logo.png', 'scripts/run.py', 'shared.md', 'SKILL.md']);
  assert.equal(truncated, false);
});

test('reads a symlinked file and flags binary content', async () => {
  const root = fixture();
  assert.equal((await readSkillFile(root, 'shared.md')).content, 'shared\n');
  assert.deepEqual(await readSkillFile(root, 'logo.png'), { size: 7, binary: true, content: null });
});

test('rejects paths that leave the skill folder', async () => {
  assert.equal(resolveInside('/skills/a', '../b/SKILL.md'), null);
  assert.equal(resolveInside('/skills/a', '/etc/passwd'), null);
  assert.equal(resolveInside('/skills/a', 'scripts/../SKILL.md'), '/skills/a/SKILL.md');
  await assert.rejects(readSkillFile(fixture(), '../outside/shared.md'));
});

test('tree rows add folders once and hide collapsed children', () => {
  const paths = ['a/b/c.md', 'a/b/d.md', 'a/e.md', 'f.md'];
  assert.deepEqual(treeRows(paths, new Set()).map(row => `${row.depth}:${row.path}`), ['0:a', '1:a/b', '2:a/b/c.md', '2:a/b/d.md', '1:a/e.md', '0:f.md']);
  assert.deepEqual(treeRows(paths, new Set(['a/b'])).map(row => row.path), ['a', 'a/b', 'a/e.md', 'f.md']);
});
