'use strict';
function supportFingerprint(){return JSON.stringify({config,employees});}
function supportActionLabel(action){return ({open_page:'Abrir página',prepare_schedule:'Preparar prévia',diagnose_system:'Verificar sistema',edit_employee:'Conferir funcionário',edit_fp:'Conferir FP',schedule_production:'Conferir programação',configure_schedule:'Conferir montagem',maintenance:'Revisar limpeza'})[action.name];}
function supportActionDetails(action){
 const labels={page:'Página',existingName:'Funcionário atual',name:'Nome',role:'Categoria',present:'Disponível na linha',sector:'Setor',existingCode:'FP atual',fp:'Código da FP',market:'Destino',revision:'Revisão',variation:'Variação',product:'Produto',date:'Data',start:'Início',end:'Fim',productCode:'Código do produto',quantity:'Quantidade',scope:'Limpeza'};
 const values={schedules:'Escalas',employees:'Funcionários',unused_fps:'FPs não utilizadas',settings:'Configurações',agenda:'Agenda',schedule:'Montagem',fp:'FPs',overview:'Visão geral',history:'Histórico',support:'Ajuda'};
 return Object.entries(action.input).map(([k,v])=>(labels[k]||k)+': '+(typeof v==='boolean'?(v?'Sim':'Não'):['page','scope'].includes(k)?values[v]||v:v)).join('\n');
}
function supportExact(items,field,value,kind){
 const matches=items.filter(x=>String(x[field]||'').trim().toLocaleLowerCase('pt-BR')===value.trim().toLocaleLowerCase('pt-BR'));
 if(matches.length!==1)throw new Error(matches.length?'Há mais de um '+kind+' com esse nome/código. Abra o cadastro para escolher.':kind+' não encontrado: '+value+'. Confira o nome/código exato.');return matches[0];
}
function supportFill(form,fields){
 if(!form)throw new Error('Não foi possível abrir o formulário.');
 for(const [key,value]of Object.entries(fields)){
  const field=form.elements.namedItem(key);if(!field)throw new Error('Campo indisponível: '+key);
  if(field.tagName==='SELECT'&&![...field.options].some(x=>x.value===value))throw new Error('Opção não cadastrada: '+value);
  if(field.type==='checkbox')field.checked=value;else field.value=String(value);
  field.dispatchEvent(new Event('change',{bubbles:true}));
 }
}
function executeSupportAction(item){
 try{
  if(!authenticated||storageMode==='loading')throw new Error('Entre no sistema e aguarde os dados carregarem.');
  if(item.used)throw new Error('Esta ação já foi aberta. Faça um novo pedido para repetir.');
  const action=window.GestorSupportActions.validate(item.action),v=action.input;
  if(document.querySelector('dialog[open]'))throw new Error('Conclua ou feche o formulário aberto antes de iniciar outra ação.');
  if(item.fingerprint!==supportFingerprint())throw new Error('Os dados mudaram desde o pedido. Envie o pedido novamente para revisar a versão atual.');
  if($('#webConflict')&&!['open_page','diagnose_system'].includes(action.name))throw new Error('Resolva o conflito de salvamento antes de alterar dados pelo chat.');
  const open=page=>{location.hash=page;render();};
  switch(action.name){
   case 'open_page':open(v.page);break;
   case 'prepare_schedule':prepareSupportSchedule();break;
   case 'diagnose_system':diagnoseSupportSystem();break;
   case 'edit_employee':{
    const person=v.existingName?supportExact(employees,'name',v.existingName,'Funcionário'):null;
    if(!person&&!v.name)throw new Error('Informe o nome do novo funcionário.');
    if(v.sector&&!sectors().includes(v.sector))throw new Error('O setor precisa estar cadastrado.');
    open('employees');editEmployee(person?.id);const fields={...v};delete fields.existingName;supportFill($('#employeeForm'),fields);break;
   }
   case 'edit_fp':{
    const fp=v.existingCode?supportExact(catalog(),'fp',v.existingCode,'FP'):null;
    open('fp');editFP(fp?.id);const fields={...v};delete fields.existingCode;supportFill($('#fpForm'),fields);break;
   }
   case 'schedule_production':{
    if(!v.fp||!v.date)throw new Error('Informe o código da FP e a data da produção.');
    const fp=supportExact(activeCatalog(),'fp',v.fp,'FP ativa');open('agenda');editAgenda(null,v.date);
    const fields={...v,fpId:fp.id};delete fields.fp;supportFill($('#agendaForm'),fields);break;
   }
   case 'configure_schedule':{
    const fp=v.fp?supportExact(activeCatalog(),'fp',v.fp,'FP ativa'):null;
    const changes={...v};delete changes.fp;if(fp)changes.product=fp.id;
    const fingerprint=supportFingerprint();
    confirmChange('Alterar montagem pelo assistente?',Object.entries(v).map(([k,value])=>k+': '+value).join(' · ')+'. A distribuição atual será descartada; o histórico será preservado.','APLICAR',()=>{
     if(!authenticated||fingerprint!==supportFingerprint()||$('#webConflict')){supportMessage('A configuração mudou ou há conflito. Faça um novo pedido.');return;}
     Object.assign(config,changes);config.manualAssignments={};config.locks={};invalidate();open('schedule');prepareSupportSchedule();
    });break;
   }
   case 'maintenance':{
    open('settings');const target={schedules:'clear-schedules',employees:'clear-employees',unused_fps:'clear-unused-fps',settings:'reset-settings'}[v.scope];
    const button=document.querySelector('[data-action="'+target+'"]');if(!button||button.disabled)throw new Error('Não há dados elegíveis para esta limpeza.');button.click();break;
   }
  }
  const form=document.querySelector('dialog[open] form');
  if(form){const fingerprint=supportFingerprint();form.addEventListener('submit',event=>{
   if(!authenticated||fingerprint!==supportFingerprint()||$('#webConflict')){event.preventDefault();event.stopImmediatePropagation();notify('Os dados mudaram ou há conflito. Feche e peça uma nova revisão.');}
  },{capture:true});}
  item.used=true;renderSupportMessages();
  if(!['prepare_schedule','diagnose_system'].includes(action.name))supportMessage(action.name==='open_page'?'Página aberta.':'Revisão aberta. Confira os campos e confirme no formulário. Nenhum dado foi salvo ou excluído por esta proposta.');
 }catch(error){supportMessage(error.message);}
}
