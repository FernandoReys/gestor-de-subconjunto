'use strict';
function validateServer(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Informe somente a origem HTTPS do servidor (https://servidor).');
  return url.origin;
}
module.exports = { validateServer };
