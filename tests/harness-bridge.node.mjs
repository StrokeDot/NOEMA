import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {request as httpRequest} from 'node:http';
import {createBridgeServer} from '../src-tauri/harness-bridge/index.mjs';
const token='a'.repeat(64);
async function fixture(t,llm){
  const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');
  const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const server=createBridgeServer(llm,{token,port});server.listen(port,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  return (path,body,headers={})=>fetch(`http://127.0.0.1:${port}/noema/v1/${path}`,{
    method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...headers},
    ...(body?{body:JSON.stringify(body)}:{})
  });
}
const base={
  listProviders:()=>[{id:'deepseek-account'},{id:'deepseek-official'},{id:'anthropic'}],
  listModels:async route=>[{id:'deepseek-flash',name:route==='deepseek-account'?'DeepSeek account':'DeepSeek API'}],
};
test('paired catalog exposes DeepSeek routes and refuses browser origins and wrong pairing',async t=>{
  const request=await fixture(t,base);
  const r=await request('models');assert.equal(r.status,200);
  const body=await r.json();assert.equal(body.bridge,'noema-dsh-writing');assert.equal(body.protocol,1);
  assert.deepEqual(body.models.map(m=>m.id),['deepseek-account/deepseek-flash','deepseek-official/deepseek-flash']);
  assert.equal((await request('models',undefined,{Authorization:'Bearer wrong'})).status,401);
  assert.equal((await request('models',undefined,{Origin:'https://example.com'})).status,403);
  const wrongHost=await new Promise((resolve,reject)=>{
    const q=httpRequest(r.url,{headers:{Host:'example.com',Authorization:'Bearer '+token}},res=>{res.resume();resolve(res.statusCode);});
    q.on('error',reject);q.end();
  });
  assert.equal(wrongHost,403);
});
test('writing call preserves context and original Unicode and never offers agent tools',async t=>{
  let captured;
  const request=await fixture(t,{...base,async *stream(options){captured=options;yield{type:'text-delta',text:'{"reply":"café"}'};yield{type:'finish',reason:{kind:'stop'}};}});
  const r=await request('reply',{model:'deepseek-account/deepseek-flash',messages:[{role:'system',content:'Writing instructions'},{role:'assistant',content:'Earlier answer'},{role:'user',content:'My original café thought.'}]});
  assert.equal(r.status,200);assert.equal((await r.json()).content,'{"reply":"café"}');
  assert.equal(captured.system,'Writing instructions');assert.deepEqual(captured.tools,[]);assert.equal(captured.provider,'deepseek-account');
  assert.deepEqual(JSON.parse(captured.messages[0].content[0].text).conversation,[{role:'assistant',content:'Earlier answer'},{role:'user',content:'My original café thought.'}]);
});
test('late quota or incomplete finish cannot return partial writing as a success',async t=>{
  for(const terminal of [undefined,{kind:'error',failure:{code:'ACCOUNT_QUOTA'}},{kind:'max-tokens'},{kind:'tool-calls'}]){
    const request=await fixture(t,{...base,async *stream(){yield{type:'text-delta',text:'partial'};if(terminal)yield{type:'finish',reason:terminal};}});
    const r=await request('reply',{model:'deepseek-account/deepseek-flash',messages:[{role:'user',content:'Thought'}]});
    assert.equal(r.status,502);assert.equal((await r.json()).error,'HARNESS_REQUEST_FAILED');
  }
});
test('unknown routes, malformed messages and absent pairing fail before inference',async t=>{
  let calls=0;
  const request=await fixture(t,{...base,async *stream(){calls++;yield{type:'finish',reason:{kind:'stop'}};}});
  for(const payload of [
    {model:'anthropic/claude',messages:[{role:'user',content:'Thought'}]},
    {model:'deepseek-account/deepseek-flash',messages:[{role:'tool',content:'Do something'}]},
    {model:'deepseek-account/deepseek-flash',messages:[{role:'user',content:''}]},
  ])assert.equal((await request('reply',payload)).status,400);
  assert.equal(calls,0);assert.throws(()=>createBridgeServer(base,{token:''}));
});
