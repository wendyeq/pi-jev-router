import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspect, summarize } from '../scripts/inspect.mjs';

const script = fileURLToPath(new URL('../scripts/inspect.mjs', import.meta.url));
const stat = (data) => JSON.stringify({ time: '2026-09-24T00:00:00.000Z', ...data });
const base = { sessionId: 'safe-id', kind: 'evaluation', question: 'model', outcome: 'selected' };

test('only matching stat metadata is parsed; no message or header leaks', () => {
  const text = [
    JSON.stringify({ type: 'session', cwd: 'SECRET_CWD', sessionId: 'safe-id' }),
    JSON.stringify({ type: 'message', message: { content: 'SECRET_MESSAGE' } }),
    stat({ ...base, gatewayCostUsd: 0, inputTokens: 0, outputTokens: 0, attempts: 1 }),
    stat({ ...base, sessionId: 'other' }),
    stat({ ...base, question: 'invalid' }),
    stat({ ...base, kind: 'applied', question: 'effort', source: 'fallback', reason: 'unavailable', thinking: 'low' }),
    '{invalid',
    JSON.stringify({ type: 'custom', customType: 'jev-route', data: base }),
  ].join('\n');
  const result = summarize('safe-id', text);
  assert.equal(result.records.length, 2);
  assert.ok(!JSON.stringify(result).includes('SECRET_'));
  assert.equal(result.aggregates.model.evaluations, 1);
  assert.equal(result.aggregates.model.httpAttempts, 1);
  assert.equal(result.aggregates.model.reportedZeroFees, 1);
  assert.equal(result.aggregates.model.feeUnavailable, 0);
  assert.equal(result.aggregates.effort.evaluations, 0);
  assert.equal(result.aggregates.effort.applied, 1);
  assert.equal(result.aggregates.skill.missingInputTokens, 0);
  assert.equal(result.aggregates.skill.gatewayCostUsd, null);
  assert.equal(result.aggregates.skill.inputTokens, null);
});

test('missing usage is different from reported zero fee', () => {
  const result = summarize('safe-id', [stat({ ...base, outcome: 'failed' }), stat({ ...base, outcome: 'selected', gatewayCostUsd: 0 })].join('\n'));
  assert.equal(result.aggregates.model.missingInputTokens, 2);
  assert.equal(result.aggregates.model.reportedZeroFees, 1);
  assert.equal(result.aggregates.model.feeReports, 1);
});

test('aggregates distinguish skipped decisions, attempts, missing fields, sources, strengths, and reasons', () => {
  const lines = [
    stat({ ...base, outcome: 'skipped-single', attempts: 9, gatewayCostUsd: 0 }),
    stat({ ...base, outcome: 'failed', reason: 'timeout', attempts: 2, milliseconds: 120, inputTokens: 7 }),
    stat({ ...base, outcome: 'temporary-failure', reason: 'timeout', attempts: 1, milliseconds: 30, outputTokens: 2, gatewayCostUsd: 0 }),
    stat({ ...base, kind: 'applied', outcome: 'fallback', source: 'local', reason: 'timeout' }),
    stat({ ...base, kind: 'applied', outcome: 'selected', source: 'jev' }),
    stat({ ...base, kind: 'applied', question: 'effort', outcome: 'selected', thinking: 'high' }),
    stat({ ...base, kind: 'applied', question: 'effort', outcome: 'fallback', thinking: 'low', source: 'default', reason: 'unavailable' }),
    stat({ ...base, attempts: -1 }),
    stat({ ...base, gatewayCostUsd: -1 }),
    stat({ ...base, inputTokens: 0.5 }),
  ];
  const result = summarize('safe-id', lines.join('\n'));
  const model = result.aggregates.model;
  assert.equal(result.records.length, 7);
  assert.equal(model.evaluations, 2);
  assert.equal(model.skippedSingle, 1);
  assert.equal(model.httpAttempts, 3);
  assert.equal(model.milliseconds, 150);
  assert.equal(model.missingInputTokens, 1);
  assert.equal(model.missingOutputTokens, 1);
  assert.equal(model.feeUnavailable, 1);
  assert.equal(model.reportedZeroFees, 1);
  assert.deepEqual(model.selectionSources, { jev: 1, local: 1 });
  assert.deepEqual(model.fallbackReasons, { timeout: 1 });
  assert.deepEqual(model.failedReasons, { timeout: 2 });
  assert.deepEqual(result.aggregates.effort.thinking, { high: 1, low: 1 });
});

test('sessions and show read only the selected safe ledger file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jev-inspect-'));
  try {
    await writeFile(join(dir, 'safe-id.jsonl'), [stat(base), JSON.stringify({ type: 'message', content: 'SECRET_MESSAGE' })].join('\n'));
    await writeFile(join(dir, 'another.jsonl'), stat({ ...base, sessionId: 'another' }));
    await writeFile(join(dir, 'invalid..jsonl'), stat(base));
    const listing = await inspect(['sessions', '--session-dir', dir]);
    assert.deepEqual(listing.sessions.map((s) => s.sessionId), ['another', 'safe-id']);
    assert.equal(listing.sessions[0].gatewayCostUsd, null);
    assert.deepEqual(await inspect(['sessions', '--state-dir', join(dir, 'not-created')]), { sessions: [] });
    assert.equal(listing.sessions[0].evaluations, 1);
    assert.ok(!JSON.stringify(listing).includes('SECRET_MESSAGE'));
    assert.equal((await inspect(['show', 'safe-id', '--state-dir', dir])).records.length, 1);
    assert.equal((await inspect(['show', 'latest', '--state-dir', dir])).sessionId, 'another');
    await assert.rejects(inspect(['show', '../safe-id', '--state-dir', dir]), /Session not found/);
    const cli = spawnSync(process.execPath, [script, '--state-dir', dir, 'show', 'safe-id'], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.ok(!cli.stdout.includes('SECRET_MESSAGE'));
    assert.equal(JSON.parse(cli.stdout).sessionId, 'safe-id');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('cli still runs when the script is reached through a symlink', async () => {
  // A skill installed as ~/.agents/skills/<name> -> checkout is invoked through the link, so the
  // entry-point check must not depend on argv[1] and import.meta.url being the same string.
  const dir = await mkdtemp(join(tmpdir(), 'jev-inspect-ledger-'));
  const linkDir = await mkdtemp(join(tmpdir(), 'jev-inspect-link-'));
  const entryPoints = [script, fileURLToPath(new URL('../skills/pi-jev-router-inspect/scripts/inspect.mjs', import.meta.url))];
  try {
    await writeFile(join(dir, 'safe-id.jsonl'), stat(base));
    for (const [index, entry] of entryPoints.entries()) {
      const link = join(linkDir, `inspect-${index}.mjs`);
      await symlink(entry, link);
      const cli = spawnSync(process.execPath, [link, '--state-dir', dir, 'show', 'safe-id'], { encoding: 'utf8' });
      assert.equal(cli.status, 0, cli.stderr);
      assert.notEqual(cli.stdout.trim(), '', 'a symlinked entry point printed nothing');
      assert.equal(JSON.parse(cli.stdout).sessionId, 'safe-id');
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(linkDir, { recursive: true, force: true });
  }
});

test('show reports top, runner-up, and margin without mixing stages or old records', () => {
  const lines = [
    stat({ ...base, choice: 'openai/luna @ max', probabilityStatus: 'available', probabilities: { 'openai/luna @ max': 0.6, 'openai/luna @ low': 0.39 }, stage: 'final' }),
    stat({ ...base, choice: 'openai/luna @ max', probabilityStatus: 'available', probabilities: { 'openai/luna @ max': 0.5, 'openai/sol @ high': 0.5 }, stage: 'final' }),
    stat({ ...base, question: 'effort', thinking: 'high', choice: 'high', probabilityStatus: 'available', probabilities: { low: 0.25, high: 0.75 } }),
    stat({ ...base, outcome: 'selected' }),
    stat({ ...base, probabilityStatus: 'invalid', probabilities: { secret: 1, low: 0 } }),
    stat({ ...base, outcome: 'skipped-single', probabilities: { only: 1 }, probabilityStatus: 'available' }),
    stat({ ...base, kind: 'applied', outcome: 'fallback' }),
    stat({ ...base, stage: 'intermediate', choice: 'openai/sol @ xhigh', probabilityStatus: 'available', probabilities: { 'openai/sol @ xhigh': 0.9, 'openai/luna @ max': 0.1 } }),
  ];
  const result = summarize('safe-id', lines.join('\n'));
  assert.deepEqual(result.probabilityDecisions.map(({ option, status, top, runnerUp, margin }) => [option, status, top, runnerUp, margin]), [
    ['openai/luna @ max', 'available', 'openai/luna @ max', 'openai/luna @ low', 0.21],
    ['openai/luna @ max', 'available', 'openai/luna @ max', 'openai/sol @ high', 0],
    ['high', 'available', 'high', 'low', 0.5],
    [null, 'missing', null, null, null],
    [null, 'invalid', null, null, null],
  ]);
  assert.equal(result.probabilityDecisions[0].probabilities['openai/luna @ low'], 0.39);
  assert.equal(Object.hasOwn(result.probabilityDecisions[0].probabilities, 'openai/luna'), false);
  assert.deepEqual(result.intermediateProbabilities.map(({ option, top, margin }) => [option, top, margin]), [['openai/sol @ xhigh', 'openai/sol @ xhigh', 0.8]]);
  assert.equal(result.probabilityDecisions.some((item) => item.stage === 'intermediate'), false);
  assert.ok(!JSON.stringify(result.probabilityDecisions).includes('secret'));
  assert.ok(!JSON.stringify(result.intermediateProbabilities).includes('secret'));
});
