import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

await mkdir('dist', { recursive: true });
const ui = await build({ entryPoints: ['web/app.js'], bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, write: false });
const template = await readFile('web/card.html', 'utf8');
await writeFile('dist/questionnaire.html', template.replace('/* APP_SCRIPT */', () => ui.outputFiles[0].text.replaceAll('</script', '<\\/script')));
await build({ entryPoints: ['server.mjs'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: 'dist/server.mjs',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
const packages = [];
for (const entry of await readdir('node_modules')) {
  if (entry.startsWith('.')) continue;
  if (entry.startsWith('@')) for (const sub of await readdir(path.join('node_modules', entry))) packages.push(path.join('node_modules', entry, sub));
  else packages.push(path.join('node_modules', entry));
}
const notices = [];
for (const dir of packages) {
  try {
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    const files = (await readdir(dir)).filter(f => /^(license|licence|notice|copying)(\.|$)/i.test(f));
    notices.push(`${pkg.name} ${pkg.version} — ${pkg.license || ''}\n${(await Promise.all(files.map(f => readFile(path.join(dir, f), 'utf8')))).join('\n')}`);
  } catch {}
}
await writeFile('dist/THIRD_PARTY_LICENSES.txt', notices.join('\n\n' + '='.repeat(70) + '\n\n'));
console.log('Built inline UI and standalone MCP server.');
