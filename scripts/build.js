const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const client = path.join(root, 'src', 'client');
const publicDir = path.join(root, 'public');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, '.openai'), { recursive: true });

['index.html', 'styles.css', 'app.js', 'scheduler.js', 'desktop.js', 'agenda.js', 'agenda-ui.js'].forEach((file) => fs.copyFileSync(path.join(client, file), path.join(dist, file)));
fs.cpSync(publicDir, dist, { recursive: true });
const version = require('../package.json').version;
const indexFile = path.join(dist, 'index.html');
fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace(/(src|href)="\/(\w[\w.-]*\.(?:js|css))"/g, `$1="/$2?v=${version}"`));
fs.copyFileSync(path.join(root, '.openai', 'hosting.json'), path.join(dist, '.openai', 'hosting.json'));

console.log('Aplicação estática e arquivos públicos preparados em dist/.');
