import {readFile,writeFile,mkdir} from 'node:fs/promises';
const sources=[];
for(const name of ['network','udaipur-gtfs','gtfs','matching']){
  sources.push(await readFile('web/'+name+'.js','utf8'));
}
sources.push('const routeById=new Map(passengerRoutes.map(r=>[r.id,r]));');
sources.push(await readFile('worker/index.js','utf8'));
await mkdir('dist',{recursive:true});
await writeFile('dist/worker.mjs',sources.join('\n'));
