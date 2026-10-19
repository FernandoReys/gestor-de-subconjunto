'use strict';
function updatePasswordVisibility(visible){const field=document.querySelector('#loginPassword'),button=document.querySelector('#loginPasswordToggle');if(!field||!button)return;field.type=visible?'text':'password';button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');button.querySelector('img').src='/icons/'+(visible?'eye-off':'eye')+'.svg';}
document.querySelector('#loginPasswordToggle').addEventListener('click',()=>updatePasswordVisibility(document.querySelector('#loginPassword').type==='password'));
