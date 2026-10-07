'use strict';
const crypto=require('node:crypto');
process.stdin.setEncoding('utf8');
let password='';
process.stdin.on('data',chunk=>{password+=chunk;if(password.length>256)process.exit(1)});
process.stdin.on('end',()=>{
  password=password.trimEnd();if(!password)process.exit(1);
  const salt=crypto.randomBytes(16);
  process.stdout.write(`${salt.toString('hex')}$${crypto.scryptSync(password,salt,64).toString('hex')}\n`);
});
