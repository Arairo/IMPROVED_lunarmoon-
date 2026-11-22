// The deploy workflow must never publish after a failed or cancelled data workflow,
// or from a branch other than main (second audit 5.1). GitHub can't be exercised from
// here, so this checks the workflow text: every job that builds for deployment is
// guarded, deploy needs those jobs, and deploy only runs for main.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
/** Text of one top-level job (from "  name:" to the next job). */
const job = (name) => {
  const m = yml.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z][\\w-]*:\\n|$)`));
  assert.ok(m, `job ${name} not found`);
  return m[1];
};
const flat = (s) => s.replace(/\s+/g, ' ');

test('Deploy workflow: data-workflow runs only continue on success, on main', () => {
  assert.match(yml, /workflow_run:\s*\n\s*workflows: \[[^\]]+\]\s*\n\s*types: \[completed\]/);
  for (const name of ['build', 'browser']) {
    const cond = flat(job(name).match(/if: >-([\s\S]*?)\n    [a-z-]+:/)?.[1] || '');
    assert.ok(cond.includes("github.event_name != 'workflow_run'"), `${name}: other events pass`);
    assert.ok(cond.includes("github.event.workflow_run.conclusion == 'success'"), `${name}: requires upstream success`);
    assert.ok(cond.includes("github.event.workflow_run.head_branch == 'main'"), `${name}: requires main`);
  }
});

test('Deploy workflow: publishing needs the build and browser jobs, never runs for pull requests, only from main', () => {
  const d = job('deploy');
  assert.match(d, /needs: \[build, browser\]/);
  assert.match(flat(d), /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
  assert.match(d, /pages: write/);
  assert.match(yml, /^permissions:\s*\n\s*contents: read/m, 'workflow default is read-only');
});

test('Deploy workflow: CI runs the unit tests, the audit and the browser smoke test on the production build', () => {
  const b = job('build');
  assert.match(b, /npm audit --omit=dev --audit-level=high/);
  assert.match(b, /npm test/);
  const br = job('browser');
  assert.match(br, /npm run build/);
  assert.match(br, /vite preview/);
  assert.match(br, /node test\/smoke-e2e\.cjs/);
});
