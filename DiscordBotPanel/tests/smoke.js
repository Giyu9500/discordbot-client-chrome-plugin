'use strict';
// Offline smoke tests. Does not connect to Discord, send messages or issue moderation actions.
const assert=require('node:assert/strict');
const {makeServer,isAllowedRoute}=require('../helper/server');
const G='123456789012345678',U='234567890123456789',C='456789012345678901',M='567890123456789012';
for(const [method,path] of [
 ['GET',`/api/v10/guilds/${G}/members`],
 ['GET',`/api/v10/guilds/${G}/auto-moderation/rules`],
 ['POST',`/api/v10/guilds/${G}/auto-moderation/rules`],
 ['PATCH',`/api/v10/guilds/${G}/auto-moderation/rules/${M}`],
 ['DELETE',`/api/v10/guilds/${G}/auto-moderation/rules/${M}`],
 ['GET',`/api/v10/channels/${C}/messages/pins`],
 ['POST',`/api/v10/channels/${C}/messages/bulk-delete`],
 ['PUT',`/api/v10/channels/${C}/messages/pins/${M}`],
 ['GET',`/api/v10/channels/${C}/messages/${M}/reactions/%F0%9F%91%8D`],
 ['GET',`/api/v10/channels/${C}/threads/archived/public`],
 ['POST',`/api/v10/channels/${C}/messages/${M}/threads`],
 ['POST',`/api/v10/channels/${C}/threads`],
 ['PATCH',`/api/v10/guilds/${G}/members/${U}`],
 ['DELETE',`/api/v10/guilds/${G}/members/${U}`],
 ['PUT',`/api/v10/guilds/${G}/bans/${U}`]
]) assert.ok(isAllowedRoute(method,path),`Not allowed: ${method} ${path}`);
assert.equal(isAllowedRoute('POST',`/api/v10/guilds/${G}/members`),false);
assert.equal(isAllowedRoute('GET','/api/v10/users/@me/guilds'),false);
assert.equal(isAllowedRoute('DELETE',`/api/v10/guilds/${G}`),false);
(async()=>{
 let upstream=[];
 const server=makeServer({fetch:async(url,options)=>{
   upstream.push({url,headers:options.headers,method:options.method});
   return new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}});
 }});
 await new Promise(r=>server.listen(17643,'127.0.0.1',r));
 const port=server.address().port,base=`http://127.0.0.1:${port}`;
 // Proxy validates its actual Host address/port, so send with explicit Host header.
 const send=(path,method='GET',headers={},body)=>fetch(base+path,{method,headers:{Host:'127.0.0.1:17643',Authorization:'Bot '+'a'.repeat(36),'X-BotPanel-Bridge':'1',...headers},body});
 try{
  const bad=await send(`/api/v10/guilds/${G}/members`,'GET',{Origin:'https://untrusted.example'});
  assert.equal(bad.status,403);
  const valid=await send(`/api/v10/guilds/${G}/members?limit=1000`);
  assert.equal(valid.status,200);
  const header=await send(`/api/v10/guilds/${G}/members/${U}`,'PATCH',{'Content-Type':'application/json','X-Audit-Log-Reason':'Antyraid'},JSON.stringify({communication_disabled_until:new Date().toISOString()}));
  assert.equal(header.status,200);
  assert.equal(upstream.at(-1).headers['X-Audit-Log-Reason'],'Antyraid');
  const badParams=await send(`/api/v10/guilds/${G}/members?unknown=x`);
  assert.equal(badParams.status,400);
  const disallowed=await send(`/api/v10/guilds/${G}`,'DELETE');assert.equal(disallowed.status,404);
  console.log('OK: routes, origin protection, audit reason, query allowlist');
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
