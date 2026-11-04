import test from 'node:test';
import assert from 'node:assert/strict';
import { checkArchitecture } from '../scripts/architecture.ts';

test('architecture guard rejects browser/backend leaks, domain SQL access and unresolved imports', () => {
  const errors = checkArchitecture([
    { path: 'public/app.ts', content: "import '../src/workspace/store.ts'; import 'node:fs';" },
    { path: 'src/workspace/store.ts', content: '' },
    { path: 'src/tasks/service.ts', content: "import './repository.ts';" },
    { path: 'src/tasks/repository.ts', content: '' },
    { path: 'src/shared/tasks.ts', content: "export * from '../tasks/service.ts';" },
    { path: 'src/client/tasks.ts', content: "import './missing.ts';" },
  ]);
  assert.equal(errors.filter(error => error.includes('forbidden dependency')).length, 4);
  assert.ok(errors.some(error => error.includes('unresolved local import')));
});

test('architecture guard detects transitive runtime cycles and checks dynamic imports', () => {
  const errors = checkArchitecture([
    { path: 'src/shared/a.ts', content: "export * from './b.ts';" },
    { path: 'src/shared/b.ts', content: "import('./c.ts');" },
    { path: 'src/shared/c.ts', content: "import './a.ts';" },
    { path: 'public/app.ts', content: "import('../src/workspace/store.ts'); import(target);" },
    { path: 'src/workspace/store.ts', content: '' },
  ]);
  assert.ok(errors.some(error => error.includes('Runtime import cycle')));
  assert.ok(errors.some(error => error.includes('forbidden dependency')));
  assert.ok(errors.some(error => error.includes('non-literal module loading')));
});

test('architecture guard permits shared contracts and type-only repository dependencies', () => {
  assert.deepEqual(checkArchitecture([
    { path: 'public/app.tsx', content: "import 'react'; import '../src/client/tasks.ts';" },
    { path: 'src/client/tasks.ts', content: "import '../shared/tasks.ts';" },
    { path: 'src/shared/tasks.ts', content: '' },
    { path: 'src/tasks/service.ts', content: "import type { Repository } from './repository.ts';" },
    { path: 'src/tasks/repository.ts', content: "import type { Service } from './service.ts'; import 'node:sqlite';" },
  ]), []);
});

test('project domain cannot import SQL or Personal task business rules at runtime', () => {
  const errors = checkArchitecture([
    { path: 'src/projects/service.ts', content: "import './repository.ts'; import '../tasks/service.ts';" },
    { path: 'src/projects/repository.ts', content: '' },
    { path: 'src/tasks/service.ts', content: '' },
  ]);
  assert.equal(errors.filter(error => error.includes('forbidden dependency')).length, 2);
});
