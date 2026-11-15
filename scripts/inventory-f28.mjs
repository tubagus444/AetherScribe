import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
const files = tracked.filter(file => (file.startsWith('src/') || /^server.*\.ts$/.test(file)) && /\.tsx?$/.test(file));
const test = file => /\.test\.tsx?$/.test(file);
const configFile = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const rows = files.map(file => {
  const text = readFileSync(path.join(root, file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const row = { file, test: test(file), lines: text.trimEnd().split(/\r?\n/).length, any: 0, assertions: 0, nonNull: 0, directives: [], exports: [], imports: [] };
  const location = node => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const edge = (specifier, kind, typeOnly, line) => {
    const resolved = ts.resolveModuleName(specifier, path.join(root, file), config.options, ts.sys).resolvedModule;
    row.imports.push({ specifier, kind, typeOnly, line, target: resolved && relative(resolved.resolvedFileName) });
  };
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) row.any++;
    if (ts.isExportAssignment(node)) row.exports.push({ name: node.isExportEquals ? 'export=' : 'default', line: location(node), kind: 'assignment' });
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) row.assertions++;
    if (ts.isNonNullExpression(node)) row.nonNull++;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      edge(node.moduleSpecifier.text, 'import', !!node.importClause?.isTypeOnly, location(node));
    }
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) edge(node.moduleSpecifier.text, 're-export', node.isTypeOnly, location(node));
      if (node.exportClause && ts.isNamedExports(node.exportClause)) row.exports.push(...node.exportClause.elements.map(element => ({ name: element.name.text, line: location(element), kind: 'specifier' })));
      else row.exports.push({ name: '*', line: location(node), kind: 'barrel' });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) edge(node.arguments[0].text, 'dynamic', false, location(node));
    if (node.parent === source && ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      const names = ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? ['default'] : ts.isVariableStatement(node) ? node.declarationList.declarations.map(item => item.name.getText(source)) : [node.name?.getText(source) || 'default'];
      row.exports.push(...names.map(name => ({ name, line: location(node), kind: ts.SyntaxKind[node.kind] })));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, source.languageVariant, text);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      for (const match of scanner.getTokenText().matchAll(/@ts-(ignore|nocheck|expect-error)\b/g)) {
        row.directives.push({ directive: match[0], line: source.getLineAndCharacterOfPosition(scanner.getTokenPos()).line + 1 });
      }
    }
  }
  return row;
});
const sum = subset => ({ files: subset.length, any: subset.reduce((n, row) => n + row.any, 0), assertions: subset.reduce((n, row) => n + row.assertions, 0), nonNull: subset.reduce((n, row) => n + row.nonNull, 0), directives: subset.reduce((n, row) => n + row.directives.length, 0) });
const focus = new Set([
  'src/services/contextProtocol.ts', 'src/services/contextEngine.ts', 'src/services/contextWorker.ts',
  'src/services/ai/types.ts', 'src/services/ai/index.ts', 'src/services/ai/proxy.ts', 'src/services/ai/sse.ts',
  'src/services/rag/oramaSync.ts', 'src/services/rag/oramaWorker.ts', 'src/db.ts', 'src/types.ts',
  'src/services/backupService.ts', 'src/lib/importRemap.ts', 'src/services/entityDeletion.ts',
  'src/lib/chapterMetadata.ts', 'src/services/chapterQueries.ts',
  'src/features/atlas/hooks/useAtlas.ts', 'src/features/atlas/components/AtlasPanel.tsx', 'src/features/atlas/components/MapCanvas.tsx',
]);
const report = {
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), typescript: ts.version,
  scope: 'Tracked src/**/*.ts(x) and root server*.ts; AST counts, no type-safety or unused-code verdict. Imports are syntactic, including type references and literal dynamic imports; new URL worker edges require manual review.',
  compiler: { strict: config.options.strict ?? false, noImplicitAny: config.options.noImplicitAny ?? config.options.strict ?? false, strictNullChecks: config.options.strictNullChecks ?? config.options.strict ?? false, allowJs: config.options.allowJs, skipLibCheck: config.options.skipLibCheck },
  runtime: sum(rows.filter(row => !row.test)), tests: sum(rows.filter(row => row.test)),
  largest: rows.filter(row => !row.test).sort((a, b) => b.lines - a.lines).slice(0, 12).map(({ file, lines, any, assertions, nonNull }) => ({ file, lines, any, assertions, nonNull })),
  browserSpecs: tracked.filter(file => file.startsWith('e2e/') && file.endsWith('.spec.ts')),
  rows: rows.map(row => {
    if (focus.has(row.file)) return { ...row, consumers: rows.filter(consumer => consumer.imports.some(edge => edge.target === row.file)).map(consumer => ({ file: consumer.file, test: consumer.test })) };
    const { imports, exports, ...counts } = row;
    return counts;
  }),
};
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
if (output) writeFileSync(path.resolve(root, output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ baseCommit: report.baseCommit, compiler: report.compiler, runtime: report.runtime, tests: report.tests, largest: report.largest }, null, 2));
