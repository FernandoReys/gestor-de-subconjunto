const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, '.openai'), { recursive: true });

['index.html', 'styles.css', 'app.js', 'scheduler.js'].forEach((file) => fs.copyFileSync(path.join(root, file), path.join(dist, file)));
fs.cpSync(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });
fs.copyFileSync(path.join(root, '.openai', 'hosting.json'), path.join(dist, '.openai', 'hosting.json'));

console.log('Protótipo preparado para publicação privada.');
