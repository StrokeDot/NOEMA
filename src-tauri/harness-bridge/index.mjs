// Optional Harness plugin. Calls its supported LLM service directly, with no
// agent loop, filesystem tools, shell tools, or provider-token export.
import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';

export const name='noema-writing-bridge';
export const inject=['llm'];
const ROUTES=new Set(['deepseek-account','deepseek-official']);
const MAX_INPUT=2_000_000;
function answer(res,status,body){
  if(res.destroyed)return;
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(body));
}
function authenticated(req,token){
  const header=req.headers.authorization;
  if(typeof header!=='string')return false;
  const expected=Buffer.from('Bearer '+token),actual=Buffer.from(header);
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
async function catalog(llm){
  const models=[];
  for(const route of llm.listProviders()){
    if(!ROUTES.has(route.id))continue;
    for(const m of await llm.listModels(route.id)){
      if(typeof m.id!=='string'||typeof m.name!=='string')continue;
      models.push({id:route.id+'/'+m.id,label:m.name+' · '+(route.id==='deepseek-account'?'Harness account':'Harness API'),route:route.id,model:m.id});
    }
  }
  return models;
}
function parseMessages(body){
  if(!Array.isArray(body.messages)||body.messages.length>600)throw new Error('INVALID_INPUT');
  const messages=body.messages.map(m=>{
    if(!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string')throw new Error('INVALID_INPUT');
    return {role:m.role,content:m.content};
  });
  // A one-shot user input is the official identity-free request shape. Keep
  // role-tagged local history verbatim in it; NOEMA already records this input.
  const system=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
  const history=messages.filter(m=>m.role!=='system');
  if(!history.some(m=>m.role==='user'&&m.content.trim()))throw new Error('INVALID_INPUT');
  return {system,messages:[{role:'user',content:[{type:'text',text:JSON.stringify({conversation:history})}]}]};
}
export function createBridgeServer(llm,{token,port=17879}={}){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new Error('NOEMA pairing is not configured');
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid NOEMA bridge port');
  let pending=false;
  const server=createServer(async(req,res)=>{
    // No CORS surface. DNS-rebinding and browser-origin requests are refused.
    if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin){answer(res,403,{error:'LOCAL_CLIENT_REQUIRED'});return;}
    if(!authenticated(req,token)){answer(res,401,{error:'PAIRING_REQUIRED'});return;}
    if(req.method==='GET'&&req.url==='/noema/v1/models'){
      try{answer(res,200,{bridge:'noema-dsh-writing',protocol:1,models:await catalog(llm)});}
      catch{answer(res,503,{error:'HARNESS_MODELS_UNAVAILABLE'});}
      return;
    }
    if(req.method!=='POST'||req.url!=='/noema/v1/reply'){answer(res,404,{error:'NOT_FOUND'});return;}
    if(!req.headers['content-type']?.startsWith('application/json')){answer(res,415,{error:'JSON_REQUIRED'});return;}
    if(pending){answer(res,409,{error:'WRITING_REQUEST_IN_PROGRESS'});return;}
    pending=true;
    const abort=new AbortController();
    const timer=setTimeout(()=>abort.abort(),240_000);timer.unref();
    res.on('close',()=>abort.abort());
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>MAX_INPUT)throw new Error('INPUT_TOO_LARGE');chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const selected=(await catalog(llm)).find(m=>m.id===body.model);
      if(!selected){answer(res,400,{error:'MODEL_UNAVAILABLE'});return;}
      const input=parseMessages(body);
      let content='',completed=false;
      for await(const chunk of llm.stream({provider:selected.route,model:selected.model,...input,tools:[],signal:abort.signal})){
        if(completed)throw new Error('INVALID_STREAM');
        if(chunk.type==='text-delta'){content+=chunk.text;if(content.length>2_000_000)throw new Error('OUTPUT_TOO_LARGE');}
        if(chunk.type==='finish'){
          if(chunk.reason?.kind!=='stop')throw new Error('MODEL_DID_NOT_COMPLETE');
          completed=true;
        }
      }
      if(!completed||!content.trim())throw new Error('MODEL_DID_NOT_COMPLETE');
      answer(res,200,{bridge:'noema-dsh-writing',protocol:1,model:selected.id,content});
    }catch(error){
      const code=['INVALID_INPUT','INPUT_TOO_LARGE'].includes(error?.message)?error.message:'HARNESS_REQUEST_FAILED';
      answer(res,code==='HARNESS_REQUEST_FAILED'?502:400,{error:code});
    }finally{clearTimeout(timer);pending=false;}
  });
  server.requestTimeout=245_000;server.headersTimeout=10_000;server.maxHeadersCount=32;
  return server;
}
export function apply(ctx,config){
  const server=createBridgeServer(ctx.llm,config);
  // Listen errors go to Harness diagnostics without request bodies or tokens.
  server.on('error',()=>console.error('[noema-writing-bridge] Could not open the local NOEMA connection. Check the port.'));
  ctx.effect(()=>{
    server.listen(config.port??17879,'127.0.0.1');
    return()=>{server.close();server.closeAllConnections();};
  },'NOEMA writing bridge');
}
