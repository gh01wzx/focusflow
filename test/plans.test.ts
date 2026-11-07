import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setImmediate as tick } from 'node:timers/promises';
import { CodexClient } from '../src/codex/client.ts';
import { createAiService } from '../src/ai/service.ts';
import type { AiRuntime } from '../src/ai/service.ts';
import { createPlanGenerator } from '../src/plans/generator.ts';
import { createPlanService, PlanGenerationError } from '../src/plans/service.ts';
import type { PlanGenerator, PlanProgress } from '../src/plans/service.ts';
import { parseSuggestedPlan, parsePlanState } from '../src/shared/plans.ts';
import type { PlanDraft, SuggestedPlan } from '../src/shared/plans.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { createPlanClient } from '../src/client/plans.ts';
import { createProjectClient } from '../src/client/projects.ts';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/database/schema.ts';
import { restoreSnapshot, schemaVersion } from '../src/database/backup.ts';

function suggested(): SuggestedPlan {
  return { milestones: [{ key: 'first-goal', title: 'A clear outcome', description: 'Why it matters', tickets: [
    { key: 'prepare', title: 'Prepare input', description: 'Collect examples', acceptanceCriteria: 'Three examples are available.', executionMode: 'manual', prerequisiteKeys: [] },
    { key: 'build', title: 'Build a small tool', description: '<script>untrusted</script>', acceptanceCriteria: 'The example produces the expected result.', executionMode: 'codex', prerequisiteKeys: ['prepare'] },
  ] }] };
}
const draft = (projectId: string = randomUUID()): PlanDraft => ({ id: randomUUID(), projectId, goal: 'A private goal', createdAt: '2026-11-07T00:00:00Z', plan: suggested() });
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settled(state: () => { busy: boolean }) {
  for (let count = 0; count < 100 && state().busy; count++) await tick();
  assert.equal(state().busy, false);
}

test('plans reject unknown fields, unsafe shapes and invalid prerequisite graphs', () => {
  assert.deepEqual(parseSuggestedPlan(suggested()), suggested());
  const changes: ((plan: SuggestedPlan) => unknown)[] = [
    plan => ({ ...plan, accessToken: 'must-not-be-stored' }),
    plan => { plan.milestones[0]!.tickets[0]!.prerequisiteKeys = ['missing']; return plan; },
    plan => { plan.milestones[0]!.tickets[0]!.prerequisiteKeys = ['prepare']; return plan; },
    plan => { plan.milestones[0]!.tickets[0]!.prerequisiteKeys = ['build']; return plan; },
    plan => { plan.milestones[0]!.tickets[1]!.prerequisiteKeys = ['prepare', 'prepare']; return plan; },
    plan => { plan.milestones[0]!.tickets[1]!.key = 'prepare'; return plan; },
    plan => { plan.milestones[0]!.tickets[0]!.acceptanceCriteria = ' '; return plan; },
    plan => { plan.milestones[0]!.tickets[0]!.title = 'x'.repeat(201); return plan; },
    plan => ({ milestones: Array.from({ length: 9 }, () => plan.milestones[0]) }),
    () => ({ milestones: [] }),
  ];
  for (const change of changes) assert.throws(() => parseSuggestedPlan(change(suggested())), /format is invalid/);
  const modes = suggested();
  assert.throws(() => parseSuggestedPlan({ milestones: [{ ...modes.milestones[0], tickets: [{ ...modes.milestones[0]!.tickets[0], executionMode: 'shell' }] }] }));
  assert.throws(() => parsePlanState({ draft: null, busy: false, cancelling: true, message: 'invalid' }));
});

test('consent, progress, cancellation and late replies preserve the previous draft', async () => {
  const prior = draft(); let saved = prior; let calls = 0;
  const reply = deferred<SuggestedPlan>(); let signal!: AbortSignal; let progress!: (kind: PlanProgress) => void;
  const service = createPlanService({ read: () => saved, save: value => { saved = value; } }, {
    generate: (_goal, abort, report) => { calls++; signal = abort; progress = report; return reply.promise; },
  });
  for (const input of [{ goal: 'Goal' }, { goal: 'Goal', confirmAllowance: false }, { goal: '', confirmAllowance: true }, { goal: 'x'.repeat(3001), confirmAllowance: true }]) {
    assert.throws(() => service.start(prior.projectId, input));
  }
  assert.equal(calls, 0);
  assert.equal(service.start(prior.projectId, { goal: 'New goal', confirmAllowance: true }).busy, true);
  progress('responding'); assert.equal(service.status(prior.projectId).message, 'AI is responding.');
  assert.throws(() => service.start(randomUUID(), { goal: 'Duplicate', confirmAllowance: true }), /active/);
  service.cancel(randomUUID()); assert.equal(signal.aborted, false);
  assert.equal(service.cancel(prior.projectId).cancelling, true);
  assert.equal(signal.aborted, true);
  reply.resolve(suggested()); await settled(() => service.status(prior.projectId));
  assert.deepEqual(saved, prior);
  assert.match(service.status(prior.projectId).message, /cancelled/);
  await service.close();
});

test('failed or malformed replacements cannot overwrite a draft or expose provider errors', async () => {
  const prior = draft(); let saved = prior;
  for (const outcome of [new Error('private@example.invalid access-token'), new PlanGenerationError('USAGE_LIMIT'), { milestones: [] }]) {
    const service = createPlanService({ read: () => saved, save: value => { saved = value; } }, {
      async generate() { if (outcome instanceof Error) throw outcome; return outcome; },
    });
    service.start(prior.projectId, { goal: 'Replace', confirmAllowance: true });
    await settled(() => service.status(prior.projectId));
    assert.deepEqual(saved, prior);
    assert.doesNotMatch(JSON.stringify(service.status(prior.projectId)), /private@example|access-token/);
    if (outcome instanceof PlanGenerationError) assert.match(service.status(prior.projectId).message, /allowance is exhausted/);
    await service.close();
  }
});

test('shutdown waits for owned cancellation cleanup and cannot save a late result', async () => {
  const reply = deferred<SuggestedPlan>(); let signal!: AbortSignal; let saves = 0;
  const service = createPlanService({ read: () => null, save: () => { saves++; } }, {
    generate: (_goal, abort) => { signal = abort; return reply.promise; },
  });
  const projectId = randomUUID();
  service.start(projectId, { goal: 'Goal', confirmAllowance: true });
  let closed = false; const closing = service.close().then(() => { closed = true; });
  await tick(); assert.equal(signal.aborted, true); assert.equal(closed, false);
  reply.resolve(suggested()); await closing;
  assert.equal(saves, 0);
  assert.throws(() => service.start(projectId, { goal: 'Goal', confirmAllowance: true }), /closing/);
});

function runtime(auth: string | null, cleanupFailure = false) {
  const methods: string[] = [];
  const value: AiRuntime = { installed: async () => true, async run(operation) {
    const input = new PassThrough(); const output = new PassThrough();
    const client = new CodexClient(input, output, 1000);
    output.on('data', chunk => {
      const message = JSON.parse(String(chunk)) as { id?: number; method: string };
      methods.push(message.method);
      if (message.id !== undefined) input.write(JSON.stringify({ id: message.id, result: message.method === 'account/read'
        ? { account: auth ? { type: auth, email: 'account@example.invalid', accessToken: 'private-credential' } : null } : {} }) + '\n');
    });
    try { const result = await operation(client, 'disposable-empty-directory'); if (cleanupFailure) throw new Error('private cleanup path'); return result; }
    finally { client.close(); input.destroy(); output.destroy(); }
  } };
  return { value, methods };
}

test('planning requires a fresh ChatGPT account, only passes the goal, and shares AI concurrency', async () => {
  for (const auth of [null, 'apiKey', 'chatgpt']) {
    const fake = runtime(auth); const ai = createAiService(fake.value); let calls = 0;
    const pending = deferred<string>(); let sent = '';
    const generator = createPlanGenerator(ai, async (_client, cwd, prompt) => {
      calls++; sent = prompt; assert.equal(cwd, 'disposable-empty-directory'); return pending.promise;
    });
    const result = generator.generate('Only this goal', new AbortController().signal, () => {});
    if (auth !== 'chatgpt') await assert.rejects(result, { code: 'AUTH_REQUIRED' });
    else {
      for (let count = 0; count < 100 && calls === 0; count++) await tick();
      await assert.rejects(generator.generate('Another goal', new AbortController().signal, () => {}), { code: 'BUSY' });
      assert.doesNotMatch(sent, /account@example|private-credential/);
      assert.match(sent, /Goal \(JSON string\): "Only this goal"/);
      pending.resolve(JSON.stringify(suggested())); assert.deepEqual(await result, suggested());
    }
    assert.equal(calls, auth === 'chatgpt' ? 1 : 0);
    assert.ok(fake.methods.includes('account/read'));
    assert.equal(fake.methods.includes('account/login/start'), false);
    await ai.close();
  }
});

test('missing runtimes, invalid model JSON and failed runtime cleanup never yield a plan', async () => {
  for (const kind of ['missing', 'json', 'cleanup']) {
    const fake = runtime('chatgpt', kind === 'cleanup');
    if (kind === 'missing') fake.value.installed = async () => false;
    const ai = createAiService(fake.value);
    const generator = createPlanGenerator(ai, async () => kind === 'json' ? 'provider private invalid JSON' : JSON.stringify(suggested()));
    await assert.rejects(generator.generate('Goal', new AbortController().signal, () => {}), error => {
      assert.ok(error instanceof PlanGenerationError); assert.doesNotMatch(error.message, /private/); return true;
    });
    await ai.close();
  }
});

test('HTTP planning persists a private draft across restart, never creates tasks, and requires local consent', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-plan-http-'));
  let calls = 0; let failure = false;
  const generator: PlanGenerator = { async generate() { calls++; if (failure) throw new Error('private provider error'); return suggested(); } };
  let server = await startWorkspaceServer({ dataDirectory: root, sampleLabel: 'Test', planGenerator: generator });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const transport: typeof fetch = (path, options) => fetch(server.origin + String(path), { ...options, headers: { ...options?.headers, Origin: server.origin } });
  const projects = createProjectClient(transport), plans = createPlanClient(transport);
  const before = await projects.read(); const id = before.projects[0]!.id;
  assert.equal((await plans.read(id)).draft, null); assert.equal(calls, 0);
  await assert.rejects(plans.generate(id, 'Goal', false), /Confirm/);
  assert.equal((await fetch(server.origin + `/api/projects/${id}/plan-draft/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"goal":"Goal","confirmAllowance":true}',
  })).status, 403);
  await assert.rejects(plans.generate(randomUUID(), 'Goal', true), /not found/);
  assert.equal(calls, 0);
  await plans.generate(id, 'A private goal', true);
  let state = await plans.read(id); for (let i = 0; state.busy && i < 100; i++) state = await plans.read(id);
  assert.deepEqual(state.draft?.plan, suggested()); assert.equal(calls, 1);
  assert.deepEqual(await projects.read(), before);
  const saved = state.draft;
  failure = true; await plans.generate(id, 'Invalid replacement', true);
  state = await plans.read(id); for (let i = 0; state.busy && i < 100; i++) state = await plans.read(id);
  assert.deepEqual(state.draft, saved); assert.doesNotMatch(state.message, /private provider/);
  await server.close();
  server = await startWorkspaceServer({ dataDirectory: root, sampleLabel: 'Test', planGenerator: generator });
  assert.deepEqual((await plans.read(id)).draft, saved); assert.equal(calls, 2);
  assert.deepEqual(await projects.read(), before);
  const wrong = createPlanClient(async () => new Response(JSON.stringify({ draft: draft(randomUUID()), busy: false, cancelling: false, message: '' })));
  await assert.rejects(wrong.read(id), /project/);
});

test('schema 6 adds draft storage only after backup; old tasks, weekly days and prerequisites recover intact', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-plan-migration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  function prior(path: string) {
    const db = new DatabaseSync(path); for (const migration of MIGRATIONS.filter(value => value.version <= 6)) db.exec(migration.sql);
    db.exec(`INSERT INTO recurrence_rules VALUES('r','Weekly','weekly','2026-11-01','2026-11-09','2026-11-01',NULL,5);
      INSERT INTO tasks VALUES('t','Keep Personal','2026-11-07','pending','2026-11-01',NULL,NULL);
      INSERT INTO projects VALUES('p','Keep project','','2026-11-01');
      INSERT INTO milestones VALUES('m','p','Keep milestone','','2026-11-01');
      INSERT INTO project_tickets VALUES('a','m','Keep A','','','ready','manual','2026-11-01','2026-11-01');
      INSERT INTO project_tickets VALUES('b','m','Keep B','','','done','manual','2026-11-01','2026-11-01');
      INSERT INTO ticket_dependencies VALUES('a','b'); PRAGMA user_version=6;`);
    db.close();
  }
  function retained(db: DatabaseSync) {
    assert.equal(db.prepare('SELECT title FROM tasks').get()?.title, 'Keep Personal');
    assert.equal(db.prepare('SELECT weekdays_mask FROM recurrence_rules').get()?.weekdays_mask, 5);
    assert.equal(db.prepare('SELECT prerequisite_id FROM ticket_dependencies').get()?.prerequisite_id, 'b');
    assert.equal(db.prepare('SELECT status FROM project_tickets WHERE id=?').get('a')?.status, schemaVersion(db) === 6 ? 'ready' : 'backlog');
  }
  const path = join(root, 'tracker.db'); prior(path);
  const store = await openWorkspaceStore(path); store.close();
  const db = new DatabaseSync(path); retained(db); assert.equal(schemaVersion(db), SCHEMA_VERSION); db.close();
  const backup = (await readdir(join(root, 'backups'))).find(file => file.endsWith('.db'))!;
  const recoveredPath = join(root, 'recovered.db'); await restoreSnapshot(join(root, 'backups', backup), recoveredPath);
  const recovered = new DatabaseSync(recoveredPath); retained(recovered); assert.equal(schemaVersion(recovered), 6);
  assert.equal(recovered.prepare("SELECT name FROM sqlite_schema WHERE name='plan_drafts'").get(), undefined); recovered.close();
  const blocked = join(root, 'blocked'); await import('node:fs/promises').then(fs => fs.mkdir(blocked));
  const blockedPath = join(blocked, 'tracker.db'); prior(blockedPath); await writeFile(join(blocked, 'backups'), 'blocked');
  await assert.rejects(() => openWorkspaceStore(blockedPath));
  const unchanged = new DatabaseSync(blockedPath); retained(unchanged); assert.equal(schemaVersion(unchanged), 6); unchanged.close();
});

test('private drafts are included in verified local snapshots', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-plan-backup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await openWorkspaceStore(join(root, 'tracker.db'));
  try {
    const project = store.projects.addProject({ title: 'Local project' }); const saved = draft(project.id);
    store.planDrafts.save(saved); const snapshot = await store.snapshot();
    store.planDrafts.save({ ...saved, goal: 'Later replacement' });
    const path = join(root, 'restored.db'); await restoreSnapshot(snapshot.path, path);
    const restored = await openWorkspaceStore(path);
    try { assert.deepEqual(restored.planDrafts.read(project.id), saved); } finally { restored.close(); }
  } finally { store.close(); }
});

test('workspace shutdown cancels planning before SQLite closes and cannot save a late result', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-plan-close-'));
  const phases: string[] = []; let aborted = false;
  const server = await startWorkspaceServer({ dataDirectory: root, sampleLabel: 'Test',
    onShutdown: stage => { phases.push(stage); }, planGenerator: {
      async generate(_goal, signal) {
        await new Promise<void>(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }));
        return suggested();
      },
    } });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const transport: typeof fetch = (path, options) => fetch(server.origin + String(path), { ...options, headers: { ...options?.headers, Origin: server.origin } });
  const project = await createProjectClient(transport).read();
  const id = project.selectedProjectId!;
  const state = await createPlanClient(transport).generate(id, 'Close this request', true);
  assert.equal(state.busy, true); await server.close(); assert.equal(aborted, true);
  assert.ok(phases.includes('plans:end')); assert.ok(phases.includes('database:begin'));
  assert.ok(phases.indexOf('plans:end') < phases.indexOf('database:begin'));
  const reopened = await openWorkspaceStore(join(root, 'tracker.db'));
  try { assert.equal(reopened.planDrafts.read(id), null); assert.deepEqual(JSON.parse(JSON.stringify(reopened.projects.view())), project); }
  finally { reopened.close(); }
});
