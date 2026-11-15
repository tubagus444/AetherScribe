import ts from 'typescript';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const policy = JSON.parse(read('scripts/maintenance-policy.json'));
export function escapes(text, file = 'probe.ts') {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const counts = { any: 0, nonNull: 0, assertions: 0, directives: 0 };
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) counts.any++;
    if (ts.isNonNullExpression(node)) counts.nonNull++;
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) counts.assertions++;
    ts.forEachChild(node, visit);
  }
  visit(source);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, source.languageVariant, text);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      counts.directives += [...scanner.getTokenText().matchAll(/@ts-(?:ignore|nocheck|expect-error)\b/g)].length;
    }
  }
  return counts;
}

// Exercise the detector on invalid examples without adding suppressions to source.
assert.deepEqual(escapes('const s = "any ! @ts-ignore";'), { any: 0, nonNull: 0, assertions: 0, directives: 0 });
assert.deepEqual(escapes('let x: any; x!; x as string; // @ts-ignore\n'), { any: 1, nonNull: 1, assertions: 1, directives: 1 });
const failures = [];
for (const [file, allowed] of Object.entries(policy.files)) {
  const actual = escapes(read(file), file);
  for (const key of Object.keys(actual)) {
    if (actual[key] > allowed[key]) failures.push(`${file}: ${key} ${actual[key]} exceeds ${allowed[key]}`);
  }
}
const configFile = ts.readConfigFile(path.join(root, 'tsconfig.strict.json'), ts.sys.readFile);
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
if (config.errors.length) throw new Error('Invalid strict configuration');
if (config.options.strict !== true || config.options.noEmit !== true) failures.push('Strict/noEmit must remain enabled');
for (const flag of ['noImplicitAny', 'strictNullChecks', 'strictFunctionTypes', 'strictPropertyInitialization', 'useUnknownInCatchVariables']) {
  if (config.options[flag] === false) failures.push(`${flag} must not be disabled`);
}
const program = ts.createProgram(config.fileNames, config.options);
const checked = new Set(program.getSourceFiles().map(source => path.relative(root, source.fileName).replaceAll('\\', '/')));
for (const file of policy.strictFiles) if (!checked.has(file)) failures.push(`Strict coverage removed: ${file}`);

// Internal modules must not call back into the public facade (state/cycle hazard).
for (const file of policy.aiInternals) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  for (const node of source.statements) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const resolved = ts.resolveModuleName(node.moduleSpecifier.text, path.join(root, file), config.options, ts.sys).resolvedModule;
      if (resolved && path.resolve(resolved.resolvedFileName) === path.join(root, 'src/services/ai/index.ts')) failures.push(`${file}: imports public facade`);
    }
  }
}
const facadeProgram = ts.createProgram([path.join(root, 'src/services/ai/index.ts')], config.options);
const checker = facadeProgram.getTypeChecker();
const facade = facadeProgram.getSourceFile(path.join(root, 'src/services/ai/index.ts'));
const symbol = facade && checker.getSymbolAtLocation(facade);
const names = new Set(symbol ? checker.getExportsOfModule(symbol).map(item => item.name) : []);
for (const name of policy.aiExports) if (!names.has(name)) failures.push(`Public AI export removed: ${name}`);
if (failures.length) throw new Error(`Maintenance guard failed:\n${failures.join('\n')}`);
console.log(`Maintenance guard passed: ${Object.keys(policy.files).length} files; ${policy.strictFiles.length} strict sources; ${policy.aiExports.length} public AI exports.`);
