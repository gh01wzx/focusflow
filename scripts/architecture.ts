import ts from 'typescript';
import { posix } from 'node:path';

export interface SourceModule {
  path: string;
  content: string;
}

const domainFiles = new Set(['service.ts', 'recurrence.ts', 'validation.ts', 'view.ts']);

function allowedDependency(from: string, to: string, typeOnly: boolean): boolean {
  if (from.startsWith('src/shared/')) return to.startsWith('src/shared/');
  if (from.startsWith('src/client/')) return to.startsWith('src/shared/') || to.startsWith('src/client/');
  if (from.startsWith('public/')) {
    return to.startsWith('public/') || to.startsWith('src/shared/') || to.startsWith('src/client/')
      || /^react(?:-dom)?(?:\/|$)/.test(to);
  }
  for (const layer of ['http', 'database', 'codex']) {
    if (from.startsWith(`src/${layer}/`) && to.startsWith('src/')) {
      return to.startsWith(`src/${layer}/`) || to.startsWith('src/shared/');
    }
  }
  if (from.startsWith('src/tasks/') && domainFiles.has(posix.basename(from)) && !typeOnly) {
    return to.startsWith('src/shared/')
      || (to.startsWith('src/tasks/') && domainFiles.has(posix.basename(to)));
  }
  return !to.startsWith('public/');
}

// Inspect actual TypeScript syntax, including re-exports and dynamic imports.
export function checkArchitecture(modules: SourceModule[]): string[] {
  const paths = new Set(modules.map(module => module.path));
  const edges = new Map<string, string[]>();
  const errors: string[] = [];
  for (const module of modules) {
    const dependencies: string[] = [];
    edges.set(module.path, dependencies);
    const source = ts.createSourceFile(module.path, module.content, ts.ScriptTarget.Latest, true);
    function dependency(specifier: string, typeOnly: boolean) {
      const local = specifier.startsWith('.');
      const target = local ? posix.normalize(posix.join(posix.dirname(module.path), specifier)) : specifier;
      if (local && !paths.has(target)) errors.push(`${module.path}: unresolved local import ${specifier}`);
      if (!allowedDependency(module.path, target, typeOnly)) {
        errors.push(`${module.path}: forbidden dependency ${specifier}`);
      }
      if (local && !typeOnly && paths.has(target)) dependencies.push(target);
    }
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const typeOnly = clause?.isTypeOnly === true || (!clause?.name && bindings
          && ts.isNamedImports(bindings) && bindings.elements.length > 0
          && bindings.elements.every(element => element.isTypeOnly)) === true;
        dependency(node.moduleSpecifier.text, typeOnly);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const typeOnly = node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause)
          && node.exportClause.elements.length > 0
          && node.exportClause.elements.every(element => element.isTypeOnly)) === true;
        dependency(node.moduleSpecifier.text, typeOnly);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
        && ts.isStringLiteral(node.argument.literal)) {
        dependency(node.argument.literal.text, true);
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
        && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) {
        dependency(node.moduleReference.expression.text, node.isTypeOnly);
      } else if (ts.isCallExpression(node)
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword
          || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument)) dependency(argument.text, false);
        else errors.push(`${module.path}: non-literal module loading cannot be checked`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  function walk(path: string, chain: string[]) {
    if (active.has(path)) {
      errors.push(`Runtime import cycle: ${[...chain.slice(chain.indexOf(path)), path].join(' -> ')}`);
      return;
    }
    if (visited.has(path)) return;
    active.add(path);
    for (const target of edges.get(path) ?? []) walk(target, [...chain, path]);
    active.delete(path);
    visited.add(path);
  }
  for (const path of paths) walk(path, []);
  return errors;
}
