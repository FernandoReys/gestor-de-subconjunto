'use strict';
const supportConversation=[];
let supportService='unknown',supportSession=0;
let supportBusy=false,supportOpen=false,supportDraft=null,supportSummary=null;
function supportPage(){
 $('#app').innerHTML=heading('AJUDA NO DIA A DIA','Assistente do Gestor','O assistente acompanha você pelo botão no canto direito.',`<button class="button primary" data-open-support>Abrir mini chat ${icon('spark')}</button>`)+`<section class="card support-intro"><h2>Ajuda para organizar a linha</h2><p>Prepare uma prévia da escala, confira pendências e tire dúvidas sem sair da página em que está trabalhando.</p><div class="actions"><button class="button" data-support-action="schedule">Preparar escala</button><button class="button" data-support-action="diagnose">Diagnosticar sistema</button></div><p class="helper">A prévia usa as regras do Gestor e só é aplicada quando você confirma. O chat não altera o código nem aprova uma escala com pendências.</p></section><div class="support-help-grid">${window.GestorHelp.articles.map(x=>`<details class="card support-article"><summary>${esc(x.title)}</summary><p>${esc(x.text)}</p><a class="button small" href="#${x.route}">Abrir no sistema →</a></details>`).join('')}</div>`;
}
function toggleSupport(open){
 supportOpen=open;const panel=$('#supportWidget'),launcher=$('#supportLauncher');if(!panel)return;
 panel.hidden=!open;launcher.setAttribute('aria-expanded',String(open));launcher.classList.remove('has-reply');
 if(open){renderSupportMessages();$('#supportQuestion').focus();}else launcher.focus();
}
function renderSupportMessages(){
 const messages=$('#supportMessages');if(!messages)return;messages.replaceChildren();
 if(!supportConversation.length){const welcome=document.createElement('p');welcome.className='support-welcome';welcome.textContent='Olá! Posso ajudar com a escala, explicar pendências e orientar sobre o sistema. O que você precisa fazer?';messages.append(welcome);}
 for(const item of supportConversation){
  const bubble=document.createElement('article');bubble.className='support-bubble '+item.role;
  const label=document.createElement('strong');label.textContent=item.role==='user'?'Você':item.mode==='ai'?'Assistente · IA':item.mode==='diagnostic'?'Diagnóstico do Gestor':'Guia local · sem resposta de IA';
  const text=document.createElement('p');text.textContent=item.content;bubble.append(label,text);
  for(const source of item.sources||[]){const link=document.createElement('a');link.href='#'+source.route;link.textContent=source.title+' →';bubble.append(link);}
  if(item.draft&&supportDraft?.id===item.draft){const button=document.createElement('button');button.className='button small';button.textContent='Conferir e aplicar prévia';button.onclick=reviewSupportDraft;bubble.append(button);}
  if(item.action){
   const details=document.createElement('pre');details.className='support-action-details';details.textContent=supportActionDetails(item.action);bubble.append(details);
   const button=document.createElement('button');button.className='button small';button.type='button';button.textContent=item.used?'Revisão já aberta':supportActionLabel(item.action);button.disabled=!!item.used||supportBusy;button.onclick=()=>executeSupportAction(item);bubble.append(button);
  }
  messages.append(bubble);
 }
 if(supportBusy){const note=document.createElement('p');note.className='helper';note.textContent='Consultando o assistente…';messages.append(note);}
 const send=$('#supportForm button[type=submit]');if(send)send.disabled=supportBusy;
 messages.scrollTop=messages.scrollHeight;
}
function supportMessage(content,mode='diagnostic',extra={}){supportConversation.push({role:'assistant',content,mode,...extra});renderSupportMessages();if(!supportOpen)$('#supportLauncher')?.classList.add('has-reply');}
async function sendSupportQuestion(question,context){
 if(supportBusy||!question.trim())return;
 const session=supportSession,fingerprint=supportFingerprint();
 supportConversation.push({role:'user',content:question.trim()});supportBusy=true;renderSupportMessages();
 try{
  const messages=[];let budget=0;for(const item of supportConversation.filter(x=>x.role==='user'||x.mode==='ai'||x.mode==='guide').slice(-9).reverse()){const content=item.content.slice(0,2000);if(budget+content.length>12000)break;messages.unshift({role:item.role,content});budget+=content.length;}
  const response=await fetch('/api/support.js',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,stream:!window.gestorDesktop,...(context?{context}:{})})});
  let data;
  if(response.headers.get('content-type')?.includes('application/x-ndjson')){
   const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',live={role:'assistant',mode:'ai',content:''};supportConversation.push(live);
   const accept=line=>{if(!line.trim())return;const event=JSON.parse(line);if(session!==supportSession||!authenticated)return;if(event.type==='delta'){live.content+=event.text;renderSupportMessages();}if(event.type==='result')data=event.data;};
   try{for(;;){const part=await reader.read();pending+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done});let at;while((at=pending.indexOf('\n'))>=0){accept(pending.slice(0,at));pending=pending.slice(at+1);}if(part.done){if(pending.trim())accept(pending);break;}}}finally{const index=supportConversation.indexOf(live);if(index>=0)supportConversation.splice(index,1);}
   if(!data)throw new Error('Resposta interrompida. Nenhuma ação foi executada. Tente novamente.');
  }else data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível enviar.');
  if(session!==supportSession||!authenticated)return;
  supportService=data.mode==='ai'?'online':data.service||'unavailable';
  const status=$('#supportService');if(status)status.textContent=data.mode==='ai'?'IA conectada · ações com revisão':({not_configured:'IA sem configuração',authentication:'IA: autenticação indisponível',credits:'IA: créditos indisponíveis',rate_limit:'IA: limite temporário',daily_limit:'IA: limite diário atingido',timeout:'IA: tempo de resposta esgotado'})[supportService]||'IA indisponível · comandos locais';
  const action=data.action?window.GestorSupportActions.validate(data.action):null;
  supportMessage(data.answer,data.mode,{...(data.sources?{sources:data.sources}:{}),...(action?{action,fingerprint}:{})});
 }catch(error){if(session===supportSession)supportMessage(error.message,'guide');}finally{if(session===supportSession){supportBusy=false;renderSupportMessages();}}
}
function prepareSupportSchedule(){
 toggleSupport(true);
 if(!activeCatalog().length){supportMessage('Cadastre uma FP com os postos necessários antes de montar a escala. Depois selecione a equipe e o assistente responsável.','diagnostic',{sources:[{title:'Cadastrar FP',route:'fp'},{title:'Funcionários',route:'employees'}]});return;}
 if(!activeCatalog().some(x=>x.id===config.product)){supportMessage('Selecione a FP e o turno na montagem antes de preparar a prévia.','diagnostic',{sources:[{title:'Selecionar FP na montagem',route:'schedule'}]});return;}
 const plan=buildResult();supportSummary=window.GestorSupportContext.summary(plan,config,employees);
 if(plan.errors.length){supportDraft=null;supportMessage('Não foi possível preparar a escala:\n\n'+plan.errors.join('\n')+'\n\nCorrija os campos na montagem e peça uma nova revisão.','diagnostic',{sources:[{title:'Abrir montagem de escala',route:'schedule'}]});return;}
 supportDraft={id:crypto.randomUUID(),fingerprint:JSON.stringify({config,employees}),plan};
 const gaps=plan.gaps.slice(0,8).map(g=>`Posto ${g.station}: sem cobertura ${S.clock(g.start)}–${S.clock(g.end)}.`);
 supportMessage([`Prévia calculada: ${plan.positions.length} posições e ${S.duration(plan.workMinutes)} efetivas.`,`Regra: 2 horas por posto; Preckoff: 1 hora. Pausas preservadas.`,plan.complete?'A distribuição não apresentou lacunas de cobertura.':`${plan.gaps.length} lacuna(s) e ${plan.warnings.length} aviso(s).`,...gaps,...plan.warnings.slice(0,5),!organizers().length?'Selecione um assistente responsável antes de confirmar a escala.':'Assistente responsável selecionado.','A prévia ainda não foi aplicada. Confira antes de usar.'].join('\n\n'),'diagnostic',{draft:supportDraft.id});
}
function reviewSupportDraft(){
 if(!supportDraft)return;
 if(supportDraft.fingerprint!==JSON.stringify({config,employees})){supportMessage('Os dados mudaram desde a análise. Prepare uma nova prévia para não aplicar uma versão desatualizada.');supportDraft=null;return;}
 const draft=supportDraft,d=$('#confirmDialog');
 d.innerHTML=`<div class="dialog-head"><h2 id="confirmDialogTitle">Aplicar prévia na montagem?</h2><button class="icon-button" data-close="confirmDialog" aria-label="Fechar">×</button></div><div class="dialog-body"><p>${draft.plan.positions.length} posições · ${esc(S.duration(draft.plan.workMinutes))} efetivas.</p><p>${draft.plan.gaps.length} lacunas e ${draft.plan.warnings.length} avisos. Confira a tabela completa na página de montagem antes de confirmar a escala.</p><p>Aplicar substitui apenas a distribuição atual. O histórico não é finalizado por esta ação.</p><p id="supportApplyError" role="alert"></p></div><div class="dialog-foot"><button class="button" data-close="confirmDialog">Voltar</button><button class="button primary" id="supportApply">Aplicar e abrir montagem</button></div>`;
 $('#supportApply').onclick=()=>{if(draft.fingerprint!==JSON.stringify({config,employees})){$('#supportApplyError').textContent='Os dados mudaram. Feche e prepare uma nova prévia.';return;}result=draft.plan;viewIndex=0;delete config.confirmedId;d.close();supportDraft=null;supportMessage('Prévia aplicada na montagem. Confira a tabela completa antes de confirmar. O histórico ainda não foi finalizado.');save();location.hash='schedule';toggleSupport(false);render();notify('Prévia aplicada. Confira a escala antes de confirmar.');};d.showModal();
}
function diagnoseSupportSystem(){
 toggleSupport(true);
 const state=storageMode==='sql'?'Este ambiente usa salvamento no servidor. Confira a confirmação no rodapé após editar; este diagnóstico não é um teste de conexão.':storageMode==='local'?'Você está em rascunho local. O servidor ainda não confirmou o salvamento. Mantenha esta aba aberta e confira sua conexão.':'Os dados ainda estão carregando. Aguarde antes de editar.';
 const conflict=$('#webConflict')?'Existe conflito de versões. Use o aviso acima para baixar as versões e revisar; não substitua os dados sem conferir.':'Não há aviso de conflito de versões nesta página.';
 supportMessage(`Diagnóstico desta página:\n\n${state}\n\n${conflict}\n\nGoogle Agenda só estará conectado após a autorização da conta.\n\nSe encontrar um erro de código, descreva a ação e a mensagem exibida. Posso orientar a investigação; a correção do programa precisa ser testada e publicada no projeto.`);
}
function initSupportWidget(){
 const launcher=document.createElement('button');launcher.id='supportLauncher';launcher.className='support-launcher';launcher.type='button';launcher.setAttribute('aria-label','Abrir assistente do Gestor');launcher.setAttribute('aria-controls','supportWidget');launcher.setAttribute('aria-expanded','false');launcher.innerHTML=`${icon('spark')}<span class="support-dot" aria-hidden="true"></span><span class="sr-only">Assistente do Gestor</span>`;
 const panel=document.createElement('section');panel.id='supportWidget';panel.className='support-widget';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Mini chat do Assistente do Gestor');
 panel.innerHTML=`<div class="support-widget-head"><span class="support-symbol">${icon('spark')}</span><div><h2>Assistente do Gestor</h2><p id="supportService">IA: aguardando primeira consulta</p></div><button class="icon-button" id="supportClose" aria-label="Fechar mini chat">×</button></div><div class="support-quick-actions"><button type="button" data-support-action="schedule">Preparar escala</button><button type="button" data-support-action="diagnose">Verificar sistema</button><button type="button" id="supportExplain">Explicar pendências</button></div><div class="support-messages" id="supportMessages" role="log" aria-live="polite" aria-relevant="additions text"></div><form id="supportForm"><label class="sr-only" for="supportQuestion">Sua dúvida</label><textarea id="supportQuestion" maxlength="2000" rows="2" required placeholder="Como posso ajudar?"></textarea><div class="support-widget-send"><button class="button small" id="supportClear" type="button">Limpar conversa</button><button class="button primary small" type="submit">Enviar ${icon('arrow')}</button></div><p class="support-privacy">Mensagens vão para a IA. Envie somente os dados necessários ao pedido, sem senhas ou informações de saúde. Consultas autorizadas podem enviar nome, disponibilidade, postos, FPs e programação necessários ao pedido. Motivos de ausência, matrícula e observações pessoais são excluídos. Ações passam por revisão antes de salvar ou excluir.</p></form>`;
 document.body.append(panel,launcher);launcher.onclick=()=>toggleSupport(!supportOpen);$('#supportClose').onclick=()=>toggleSupport(false);
 $('#supportClear').onclick=()=>{if(supportBusy)return;supportConversation.length=0;supportDraft=null;supportSummary=null;renderSupportMessages();};
 $('#supportForm').onsubmit=event=>{event.preventDefault();const field=$('#supportQuestion'),question=field.value;field.value='';void sendSupportQuestion(question);};
 $('#supportExplain').onclick=()=>{if(supportDraft&&supportDraft.fingerprint!==JSON.stringify({config,employees})){prepareSupportSchedule();return;}if(!supportSummary){prepareSupportSchedule();return;}void sendSupportQuestion('Explique as pendências deste resumo da escala e quais campos preciso revisar, sem inventar funcionários ou aprovar produção.',supportSummary);};
 document.addEventListener('click',event=>{const button=event.target.closest('[data-open-support],[data-support-action]');if(!button)return;if(button.hasAttribute('data-open-support'))toggleSupport(true);else if(button.dataset.supportAction==='schedule')prepareSupportSchedule();else diagnoseSupportSystem();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&supportOpen&&!document.querySelector('dialog[open]'))toggleSupport(false);});
}
window.addEventListener('DOMContentLoaded',initSupportWidget);

function resetSupportSession(){supportSession++;supportBusy=false;supportConversation.length=0;supportDraft=null;supportSummary=null;const field=$('#supportQuestion');if(field)field.value='';renderSupportMessages();}
