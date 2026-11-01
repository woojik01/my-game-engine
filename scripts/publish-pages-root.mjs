import { execFileSync } from 'node:child_process';

// Only verified outputs are staged. A normal push rejects concurrent main changes.
const generated = ['assets', 'index.html', 'icon.svg', 'manifest.webmanifest', 'sw.js'];
execFileSync('git', ['add', '--', ...generated], { stdio: 'inherit' });
const files = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
if (files.some((path) => !generated.includes(path) && !path.startsWith('assets/'))) {
  throw new Error('Unexpected source changes are staged; refusing to publish.');
}
if (files.length) {
  execFileSync('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', 'Publish verified game editor build'], { stdio: 'inherit' });
  execFileSync('git', ['push', 'origin', 'HEAD:main'], { stdio: 'inherit' });
} else {
  console.log('Verified Pages root already matches dist.');
}
