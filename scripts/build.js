const fs = require('fs');
const path = require('path');

const {execFileSync}=require('node:child_process');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const client = path.join(root, 'src', 'client');
const publicDir = path.join(root, 'public');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, '.openai'), { recursive: true });

['index.html', 'styles.css', 'app.js', 'scheduler.js', 'desktop.js', 'agenda.js', 'agenda-ui.js', 'shell.js', 'web-sync.js', 'support.js', 'support-knowledge.js', 'support-context.js', 'support-actions.js', 'support-executor.js', 'dashboard-ui.js', 'security-ui.js'].forEach((file) => fs.copyFileSync(path.join(client, file), path.join(dist, file)));
fs.cpSync(publicDir, dist, { recursive: true });
const domainOutput=path.join(dist,'_domain');
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.json'),'--noEmit','false','--outDir',domainOutput],{stdio:'inherit'});
const domainJs=fs.readFileSync(path.join(domainOutput,'dashboard.js'),'utf8');
fs.writeFileSync(path.join(dist,'dashboard-model.js'),'(function(){const exports={};'+domainJs+';window.GestorDashboard=exports;})();');
fs.rmSync(domainOutput,{recursive:true,force:true});
const version = require('../package.json').version;
const indexFile = path.join(dist, 'index.html');
fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace(/(src|href)="\/(\w[\w.-]*\.(?:js|css))"/g, `$1="/$2?v=${version}"`));
fs.copyFileSync(path.join(root, '.openai', 'hosting.json'), path.join(dist, '.openai', 'hosting.json'));

console.log('Aplicação estática e arquivos públicos preparados em dist/.');
