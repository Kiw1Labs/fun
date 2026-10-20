import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

export const root=fileURLToPath(new URL('../',import.meta.url));
export function loadLocalEnv() {
  // O ambiente explícito prevalece; .env.local tem prioridade sobre .env.
  for(const filename of ['.env.local','.env']) {
    try { process.loadEnvFile(join(root,filename)); }
    catch(error) {
      if(error.code==='ENOENT') continue;
      console.error(`Não foi possível carregar ${filename}. Confira as permissões e use Node 20.12 ou mais recente.`);
      process.exit(1);
    }
  }
}
