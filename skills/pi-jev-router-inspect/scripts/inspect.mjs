#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Match Pi's session ID alphabet; never accept a path separator or dot-segment.
const idPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
const questions = ['model', 'effort', 'skill'];
const outcomes = ['selected', 'failed', 'temporary-failure', 'skipped-single', 'fallback'];
const strings = ['target', 'thinking', 'source', 'reason'];
const numbers = ['attempts', 'milliseconds', 'inputTokens', 'outputTokens', 'gatewayCostUsd'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isValid = (data, id) => isObject(data) && data.sessionId === id && ['evaluation', 'applied'].includes(data.kind) && questions.includes(data.question) && outcomes.includes(data.outcome)
  && strings.every((key) => data[key] === undefined || typeof data[key] === 'string')
  && numbers.every((key) => data[key] === undefined || typeof data[key] === 'number' && Number.isFinite(data[key]) && data[key] >= 0 && (!['attempts', 'inputTokens', 'outputTokens'].includes(key) || Number.isSafeInteger(data[key])));
const tally = (rows, field) => Object.fromEntries([...new Set(rows.map((r) => r[field]).filter((v) => typeof v === 'string' && v.length > 0))].sort().map((value) => [value, rows.filter((r) => r[field] === value).length]));
const total = (rows, field) => rows.reduce((sum, r) => sum + (r[field] ?? 0), 0);
const statuses = ['available', 'missing', 'invalid'];
const stages = ['intermediate', 'final'];
const distribution = (value) => {
  if (!isObject(value)) return null;
  const entries = Object.entries(value);
  if (entries.length < 1 || entries.length > 32 || !entries.every(([key, n]) => typeof key === 'string' && key.length > 0 && key.length <= 300 && typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) return null;
  return Object.fromEntries(entries);
};
const probabilityDecision = (entry) => {
  const declared = statuses.includes(entry.probabilityStatus) ? entry.probabilityStatus : 'missing';
  const probabilities = declared === 'available' ? distribution(entry.probabilities) : null;
  const status = declared === 'available' && !probabilities ? 'invalid' : declared;
  const ranked = Object.entries(probabilities ?? {}).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const option = typeof entry.choice === 'string' && entry.choice ? entry.choice : entry.question === 'model' && entry.target && entry.thinking ? `${entry.target} @ ${entry.thinking}` : entry.thinking ?? entry.target ?? null;
  return {
    time: typeof entry.time === 'string' ? entry.time : null, question: entry.question, stage: entry.stage ?? null, option, status, probabilities,
    top: ranked[0]?.[0] ?? null, runnerUp: ranked[1]?.[0] ?? null,
    margin: ranked.length > 1 ? Number((ranked[0][1] - ranked[1][1]).toFixed(8)) : null,
  };
};

export function summarize(id, text) {
  const records = [];
  for (const line of text.split('\n')) {
    try {
      const entry = JSON.parse(line);
      if (isValid(entry, id)) {
        const { sessionId, kind, question, outcome } = entry;
        const probabilityStatus = statuses.includes(entry.probabilityStatus) ? entry.probabilityStatus : undefined;
        const probabilities = probabilityStatus === 'available' ? distribution(entry.probabilities) : null;
        const stage = stages.includes(entry.stage) ? entry.stage : undefined;
        records.push({
          sessionId, kind, question, outcome,
          ...Object.fromEntries([...strings, ...numbers].filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]])),
          ...(typeof entry.time === 'string' ? { time: entry.time } : {}),
          ...(typeof entry.choice === 'string' && entry.choice.length > 0 && entry.choice.length <= 300 ? { choice: entry.choice } : {}),
          ...(stage ? { stage } : {}),
          ...(probabilityStatus ? { probabilityStatus: probabilityStatus === 'available' && !probabilities ? 'invalid' : probabilityStatus } : {}),
          ...(probabilities ? { probabilities } : {}),
        });
      }
    } catch { /* A malformed line must not hide other records. */ }
  }
  const aggregates = Object.fromEntries(questions.map((question) => {
    const allEvaluations = records.filter((r) => r.kind === 'evaluation' && r.question === question);
    const evaluations = allEvaluations.filter((r) => r.outcome !== 'skipped-single');
    const applied = records.filter((r) => r.kind === 'applied' && r.question === question);
    const fees = evaluations.filter((r) => r.gatewayCostUsd !== undefined);
    return [question, {
      evaluations: evaluations.length, skippedSingle: allEvaluations.length - evaluations.length, applied: applied.length,
      outcomes: Object.fromEntries(outcomes.map((outcome) => [outcome, allEvaluations.filter((r) => r.outcome === outcome).length])),
      httpAttempts: total(evaluations, 'attempts'), milliseconds: total(evaluations, 'milliseconds'),
      missingInputTokens: evaluations.filter((r) => r.inputTokens === undefined).length,
      missingOutputTokens: evaluations.filter((r) => r.outputTokens === undefined).length,
      inputTokens: evaluations.some((r) => r.inputTokens !== undefined) ? total(evaluations, 'inputTokens') : null,
       outputTokens: evaluations.some((r) => r.outputTokens !== undefined) ? total(evaluations, 'outputTokens') : null,
      feeReports: fees.length, feeUnavailable: evaluations.length - fees.length,
      reportedZeroFees: fees.filter((r) => r.gatewayCostUsd === 0).length, gatewayCostUsd: fees.length ? total(fees, 'gatewayCostUsd') : null,
      ...(question === 'effort' ? { thinking: tally(applied, 'thinking') } : {}),
      ...(question === 'model' ? { selectionSources: tally(applied, 'source') } : {}),
      fallbackSources: tally(applied.filter((r) => r.outcome === 'fallback' || r.reason), 'source'),
      fallbackReasons: tally(applied.filter((r) => r.outcome === 'fallback' || r.reason), 'reason'),
      failedReasons: tally(evaluations.filter((r) => r.outcome === 'failed' || r.outcome === 'temporary-failure'), 'reason'),
    }];
  }));
  const selected = records.filter((record) => record.kind === 'evaluation' && record.outcome === 'selected');
  // Chunk assessments are not the pinned decision and are not folded into its margin.
  return {
    sessionId: id, records, aggregates,
    probabilityDecisions: selected.filter((record) => record.stage !== 'intermediate').map(probabilityDecision),
    intermediateProbabilities: selected.filter((record) => record.stage === 'intermediate').map(probabilityDecision),
  };
}

export async function inspect(argv, env = process.env) {
  let stateDir = join(env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent'), 'jev-router', 'sessions');
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--state-dir' || argv[i] === '--session-dir') {
      if (!argv[i + 1]) throw new Error(`${argv[i]} requires a directory`);
      stateDir = argv[++i];
    } else if (argv[i].startsWith('--')) throw new Error(`Unknown option: ${argv[i]}`);
    else args.push(argv[i]);
  }
  const files = await readdir(stateDir, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const ids = files.filter((f) => f.isFile() && f.name.endsWith('.jsonl') && idPattern.test(f.name.slice(0, -6))).map((f) => f.name.slice(0, -6)).sort();
  if (args.length === 1 && args[0] === 'sessions') {
    return { sessions: await Promise.all(ids.map(async (id) => {
      const { aggregates } = summarize(id, await readFile(join(stateDir, `${id}.jsonl`), 'utf8'));
      return { sessionId: id, evaluations: questions.reduce((sum, q) => sum + aggregates[q].evaluations, 0), httpAttempts: questions.reduce((sum, q) => sum + aggregates[q].httpAttempts, 0), gatewayCostUsd: questions.some((q) => aggregates[q].feeReports > 0) ? questions.reduce((sum, q) => sum + (aggregates[q].gatewayCostUsd ?? 0), 0) : null, feeUnavailable: questions.reduce((sum, q) => sum + aggregates[q].feeUnavailable, 0), modelSources: aggregates.model.selectionSources, thinking: aggregates.effort.thinking };
    })) };
  }
  if (args.length === 2 && args[0] === 'show') {
    const id = args[1] === 'latest' ? (await Promise.all(ids.map(async (name) => ({ name, mtime: (await stat(join(stateDir, `${name}.jsonl`))).mtimeMs })))).sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name))[0]?.name : args[1];
    if (!id || !idPattern.test(id) || !ids.includes(id)) throw new Error('Session not found');
    return summarize(id, await readFile(join(stateDir, `${id}.jsonl`), 'utf8'));
  }
  throw new Error('Usage: inspect.mjs [--state-dir DIR] sessions | show <session-id|latest>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspect(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
