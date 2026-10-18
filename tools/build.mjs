import {mkdir, readFile, writeFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('dist/assets', {recursive: true});
let html = await readFile('frontend/index.html', 'utf8');
for (const file of ['app.js', 'style.css']) {
  const bytes = await readFile(`frontend/${file}`);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const target = `${file.split('.')[0]}.${hash}.${file.split('.')[1]}`;
  await writeFile(`dist/assets/${target}`, bytes);
  html = html.replace(`/assets/${file}`, `/assets/${target}`);
}
await writeFile('dist/index.html', html);
const bytes = (await Promise.all(['frontend/app.js','frontend/style.css','dist/index.html'].map(async p => (await stat(p)).size))).reduce((a,b)=>a+b,0);
console.log(`Build estático concluído: ${bytes} bytes sem compressão. Nenhuma dependência de frontend em produção.`);
