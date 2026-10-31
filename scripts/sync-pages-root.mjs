import { cp, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(projectRoot, 'dist');

// GitHub Pages is configured to publish the repository root. Mirror only the
// generated app shell and asset directory there while keeping source files intact.
await rm(resolve(projectRoot, 'assets'), { recursive: true, force: true });
await cp(resolve(dist, 'assets'), resolve(projectRoot, 'assets'), { recursive: true });
for (const name of ['index.html', 'icon.svg', 'manifest.webmanifest', 'sw.js']) {
  await copyFile(resolve(dist, name), resolve(projectRoot, name));
}
console.log('GitHub Pages root files updated from dist/.');
