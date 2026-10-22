import {mkdir, readFile, writeFile, stat, cp, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
for (const source of ['frontend/app.js', 'frontend/batata.js', 'frontend/pokerush.js', 'frontend/godmode.js', 'frontend/nova-questao.js']) {
  const syntax = spawnSync(process.execPath, ['--check', source], {stdio:'inherit',windowsHide:true});
  if (syntax.status !== 0) throw new Error('Build interrompido: corrija o JavaScript antes de atualizar a interface.');
}
await mkdir('dist/assets', {recursive: true});
await mkdir('dist/brand', {recursive: true});
let html = await readFile('frontend/index.html', 'utf8');
for (const file of ['app.js', 'style.css', 'batata.js', 'batata.css', 'pokerush.js', 'pokerush.css']) {
  const bytes = await readFile(`frontend/${file}`);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const target = `${file.split('.')[0]}.${hash}.${file.split('.')[1]}`;
  await writeFile(`dist/assets/${target}`, bytes);
  html = html.replace(`/assets/${file}`, `/assets/${target}`);
}
await writeFile('dist/brand/fun-logo.png', await readFile('frontend/brand/fun-logo.png'));
await writeFile('dist/brand/fun-favicon.png', await readFile('frontend/brand/fun-favicon.png'));
await writeFile('dist/favicon.svg', await readFile('frontend/favicon.svg'));
await writeFile('dist/index.html', html);
await cp('content/pokerush', 'dist/assets/pokerush', {recursive:true});
await writeFile('dist/godmode.html', await readFile('frontend/godmode.html'));
await writeFile('dist/nova-questao.html', await readFile('frontend/nova-questao.html'));
const paths=['frontend/app.js','frontend/style.css','frontend/batata.js','frontend/batata.css','frontend/pokerush.js','frontend/pokerush.css','frontend/godmode.js','frontend/godmode.css','frontend/nova-questao.js','frontend/nova-questao.css','dist/index.html','dist/godmode.html','dist/nova-questao.html','dist/brand/fun-logo.png','dist/brand/fun-favicon.png','dist/favicon.svg',...(await readdir('content/pokerush')).map(name=>`content/pokerush/${name}`)];
const bytes = (await Promise.all(paths.map(async p => (await stat(p)).size))).reduce((a,b)=>a+b,0);
console.log(`Build estático concluído: ${bytes} bytes sem compressão. Nenhuma dependência de frontend em produção.`);
