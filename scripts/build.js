const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const client = path.join(root, 'src', 'client');
const publicDir = path.join(root, 'public');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, '.openai'), { recursive: true });

['index.html', 'styles.css', 'app.js', 'scheduler.js'].forEach((file) => fs.copyFileSync(path.join(client, file), path.join(dist, file)));
fs.cpSync(publicDir, dist, { recursive: true });
fs.copyFileSync(path.join(root, '.openai', 'hosting.json'), path.join(dist, '.openai', 'hosting.json'));

console.log('Aplicação estática e arquivos públicos preparados em dist/.');
