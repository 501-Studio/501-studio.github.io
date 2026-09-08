import {SUPABASE,PUBLIC_KEY,applyLocal,inverseOps,uid,demoSnapshot} from './core.js';
import {enrichDemo} from './journey-domain.js';
import {errorMessage,isConnectionError,rpcError} from './errors.js';
export class Store {
 constructor(){this.key=localStorage.getItem('dayboard.key')||'';this.demo=false;this.snapshot=null;this.busy=false;this.error='';this.saveError='';this.onchange=()=>{};this.lastRead=0;this.undo=null;}
 async rpc(name,args={}) {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);
  try {
   const response=await fetch(`${SUPABASE}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_key:this.key,...args}),signal:controller.signal,cache:'no-store'});
   let data;
   try { data=await response.json(); } catch { throw rpcError(null,response.ok?502:response.status); }
   if(!response.ok)throw rpcError(data,response.status);
   return data;
  } finally {clearTimeout(timeout);}
 }
 async connect(key){this.key=key.trim();const snapshot=await this.rpc('dayboard_read');this.demo=false;this.snapshot=snapshot;localStorage.setItem('dayboard.key',this.key);this.lastRead=Date.now();this.error='';this.saveError='';this.onchange();}
 async refresh(){
  if(this.demo||!this.key||this.busy||document.hidden)return;
  try {
   const snapshot=await this.rpc('dayboard_read');
   // A slow read must not replace a newer write or a different workspace.
   if(this.busy||this.snapshot&&(snapshot.workspaceId!==this.snapshot.workspaceId||snapshot.revision<this.snapshot.revision))return;
   const recovered=!!this.error,changed=JSON.stringify(snapshot)!==JSON.stringify(this.snapshot);
   if(this.snapshot&&snapshot.revision!==this.snapshot.revision)this.undo=null;
   this.snapshot=snapshot;this.lastRead=Date.now();this.error='';
   // Also repaint on recovery when the data is identical, otherwise the old warning stays.
   if(changed||recovered)this.onchange();
  }catch(error){this.error=errorMessage(error);this.onchange();}
 }
 async writeFailure(error){
  this.saveError=errorMessage(error);
  this.error=isConnectionError(error)?errorMessage(error):'';
  if(errorMessage(error)==='VERSION_CONFLICT'){
   try {this.snapshot=await this.rpc('dayboard_read');this.lastRead=Date.now();this.error='';this.undo=null;}
   catch(readError){this.error=errorMessage(readError);return readError;}
   this.saveError='다른 기기에서 변경되었습니다. 최신 내용으로 갱신했으니 수정 내용을 확인하고 다시 저장하세요.';
   return new Error(this.saveError);
  }
  return error;
 }
 async commit(operations,{remember=true}={}){
  if(!operations.length)return;
  if(this.busy)throw new Error('이전 저장을 마친 후 다시 시도하세요.');
  if(!this.snapshot)throw new Error('개인 보드를 먼저 연결해 주세요.');
  this.busy=true;this.onchange();
  const before=structuredClone(this.snapshot.state);
  try {
   // Validate the whole proposed hierarchy BEFORE sending. Server validation remains authoritative.
   const proposed=applyLocal(before,operations);
   if(this.demo)this.snapshot={...this.snapshot,state:proposed,revision:this.snapshot.revision+1,updatedAt:new Date().toISOString()};
   else this.snapshot=await this.rpc('dayboard_apply',{p_base_revision:this.snapshot.revision,p_operations:operations,p_approved:true});
   this.undo=remember?{revision:this.snapshot.revision,operations:inverseOps(before,this.snapshot.state)}:null;
   this.error='';this.saveError='';this.lastRead=Date.now();
  }catch(error){throw await this.writeFailure(error);}
  finally{this.busy=false;this.onchange();}
 }
 async propose(title,operations){
  if(this.busy)throw new Error('이전 저장을 마친 후 다시 시도하세요.');
  try{
   applyLocal(this.snapshot.state,operations);
   if(this.demo){const p={id:uid(),title,operations,base_revision:this.snapshot.revision,status:'pending',expires_at:new Date(Date.now()+86400000).toISOString()};this.snapshot.proposals.unshift(p);this.saveError='';this.onchange();return p.id;}
   const r=await this.rpc('dayboard_propose',{p_base_revision:this.snapshot.revision,p_operations:operations,p_title:title});
   this.saveError='';await this.refresh();return r.proposalId;
  }catch(error){const failure=await this.writeFailure(error);this.onchange();throw failure;}
 }
 async decide(id,approved){
  if(this.busy)throw new Error('저장 중입니다.');
  const p=this.snapshot.proposals.find(x=>x.id===id);
  if(!p)throw new Error('제안을 찾을 수 없습니다. 최신 상태를 불러와 주세요.');
  if(this.demo){if(approved){if(p.base_revision!==this.snapshot.revision)throw new Error('일정이 변경되었습니다. 제안을 다시 만들어 주세요.');await this.commit(p.operations);}p.status=approved?'applied':'rejected';this.onchange();return;}
  this.busy=true;this.onchange();
  try {
   if(approved&&p.status==='pending')applyLocal(this.snapshot.state,p.operations);
   this.snapshot=await this.rpc('dayboard_decide',{p_proposal_id:id,p_approved:approved});
   this.error='';this.saveError='';this.lastRead=Date.now();if(approved)this.undo=null;
  }catch(error){throw await this.writeFailure(error);}
  finally{this.busy=false;this.onchange();}
 }
 demoStart(){this.demo=true;this.snapshot=demoSnapshot();this.snapshot.state=enrichDemo(this.snapshot.state);this.error='';this.saveError='';this.onchange();}
 disconnect(){this.key='';this.snapshot=null;this.demo=false;this.undo=null;this.error='';this.saveError='';localStorage.removeItem('dayboard.key');this.onchange();}
}
