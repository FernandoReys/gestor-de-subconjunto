'use strict';
function setSidebarCollapsed(collapsed){
 document.body.classList.toggle('sidebar-collapsed',collapsed);
 const button=document.querySelector('#sidebarToggle');
 button.textContent=collapsed?'→':'←';button.setAttribute('aria-expanded',String(!collapsed));
 button.setAttribute('aria-label',collapsed?'Expandir menu lateral':'Recolher menu lateral');button.title=button.getAttribute('aria-label');
 try{localStorage.setItem('gestor-sidebar-collapsed',String(collapsed));}catch{}
}
function initSidebar(){
 let collapsed=false;try{collapsed=localStorage.getItem('gestor-sidebar-collapsed')==='true';}catch{}
 setSidebarCollapsed(collapsed);
 document.querySelector('#sidebarToggle').onclick=()=>{
  if(matchMedia('(max-width:760px)').matches)toggleMenu(false);
  else setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
 };
}
