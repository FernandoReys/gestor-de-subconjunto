'use strict';
// The test website shares the explicitly isolated workspace with the desktop pilot.
// Revisions prevent a second browser from silently replacing newer changes.
if(!window.gestorDesktop){
 const request=window.fetch.bind(window),key='gestor-web-pending-v1';
 let settings,revision=null,pending=null,conflict=false;
 try{pending=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
 const remember=()=>{try{pending?sessionStorage.setItem(key,JSON.stringify(pending)):sessionStorage.removeItem(key);}catch{}};
 const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 function showConflict(remote){
  conflict=true;let panel=document.querySelector('#webConflict');
  if(!panel){panel=document.createElement('section');panel.id='webConflict';panel.className='alert web-conflict';panel.setAttribute('role','alert');document.querySelector('main').prepend(panel);}
  panel.replaceChildren();const text=document.createElement('p');text.textContent='Há uma versão diferente no servidor. As alterações desta aba foram preservadas. Baixe as duas versões antes de carregar os dados do servidor.';panel.append(text);
  const backup=document.createElement('button');backup.className='button';backup.textContent='Baixar versões para revisão';
  backup.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({local:pending,remote},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gestor-revisao-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const reload=document.createElement('button');reload.className='button';reload.textContent='Carregar servidor após revisão';reload.onclick=()=>{if(confirm('Você conferiu ou baixou as versões? As alterações desta aba serão substituídas pela versão do servidor.')){pending=null;remember();location.reload();}};panel.append(backup,reload);
 }
 window.fetch=async(url,options={})=>{
  if(url!=='/api/state.js')return request(url,options);
  if(!settings){const r=await request('/api/runtime.js',{cache:'no-store'});if(!r.ok)return r;settings=await r.json();}
  if(!settings.sharedWorkspace)return request(url,options);
  if((options.method||'GET')==='GET'){
   const response=await request('/api/desktop-sync.js?cursor=0',{cache:'no-store'});if(!response.ok)return response;
   const remote=await response.json();revision=remote.revision;
   if(pending){showConflict(remote);return json(200,pending.latestState||pending.state);}
   return json(200,remote.state||{config:{},employees:[],generated:false});
  }
  if(conflict)return json(409,{error:'Revise as versões no aviso acima. Nenhum dado remoto foi substituído.'});
  if(revision===null)return json(409,{error:'Carregue o planejamento antes de salvar.'});
  const body=JSON.parse(options.body),state={config:body.config,employees:body.employees,generated:!!body.generated};
  if(pending&&JSON.stringify(pending.state)!==JSON.stringify(state)){pending.latestState=state;remember();return json(409,{error:'Há um envio sem confirmação. As novas alterações foram preservadas nesta aba. Recarregue para revisar.'});}
  if(!pending){pending={id:crypto.randomUUID(),deviceId:crypto.randomUUID(),baseRevision:revision,createdAt:new Date().toISOString(),state};remember();}
  const response=await request('/api/desktop-sync.js',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)});
  const result=await response.json();if(response.ok){revision=result.revision;pending=null;remember();return json(200,{saved:true});}
  if(result.conflict)showConflict(result);
  return json(response.status,result);
 };
 window.addEventListener('beforeunload',event=>{if(pending){event.preventDefault();event.returnValue='';}});
}
