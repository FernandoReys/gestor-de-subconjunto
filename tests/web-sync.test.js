'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const source=fs.readFileSync(require.resolve('../src/client/web-sync.js'),'utf8');
function client(backend){
 const memory=new Map(),nodes=new Map();
 const element=()=>({append(){},replaceChildren(){},setAttribute(){},click(){}});
 const document={querySelector(selector){if(selector==='main')return {prepend(panel){nodes.set('#'+panel.id,panel);}};return nodes.get(selector)||null;},createElement:element};
 const window={fetch:backend,addEventListener(){}};
 vm.runInNewContext(source,{window,document,sessionStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},Response,crypto,JSON,Blob,URL,setTimeout,Date,location:{reload(){}},confirm:()=>false});
 return {fetch:window.fetch,memory};
}
test('two web clients preserve both versions when a stale tab tries to save',async()=>{
 let revision=1,state={config:{value:'original'},employees:[],generated:false};
 const backend=async(url,options={})=>{
  const json=(status,data)=>new Response(JSON.stringify(data),{status});
  if(url==='/api/runtime.js')return json(200,{sharedWorkspace:true});
  if(!options.method)return json(200,{revision,state});
  const op=JSON.parse(options.body);if(op.baseRevision!==revision)return json(409,{conflict:true,revision,state});
  state=op.state;return json(200,{revision:++revision});
 };
 const a=client(backend),b=client(backend);await a.fetch('/api/state.js');await b.fetch('/api/state.js');
 const first={config:{value:'first'},employees:[],generated:false},second={config:{value:'second'},employees:[],generated:false};
 assert.equal((await a.fetch('/api/state.js',{method:'PUT',body:JSON.stringify(first)})).status,200);
 assert.equal((await b.fetch('/api/state.js',{method:'PUT',body:JSON.stringify(second)})).status,409);
 assert.equal(state.config.value,'first');assert.equal(JSON.parse([...b.memory.values()][0]).state.config.value,'second');
});
