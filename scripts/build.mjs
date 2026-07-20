import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'client', 'lib'), { recursive: true });
await mkdir(resolve(dist, 'server'), { recursive: true });
await cp(resolve(root, 'index.html'), resolve(dist, 'client', 'index.html'));
await cp(resolve(root, 'lib', 'three.module.js'), resolve(dist, 'client', 'lib', 'three.module.js'));
await cp(resolve(root, 'src'), resolve(dist, 'client', 'src'), { recursive: true });   // modular gameplay
for (const f of ['manifest.webmanifest', 'icon.svg', 'sw.js']) {                        // PWA shell
  await cp(resolve(root, f), resolve(dist, 'client', f));
}
await writeFile(resolve(dist, 'server', 'index.js'), `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};\n`);

console.log('Hood Run release build is ready.');
