'use strict';
const assert=require('node:assert/strict');
const {makeServer,isAllowedRoute}=require('../helper/server');
const G='123456789012345678',R='234567890123456789';
for(const url of [`/api/v10/guilds/${G}/roles`,`/api/v10/guilds/${G}/channels`])assert.equal(isAllowedRoute('PATCH',url),true,url);
assert.equal(isAllowedRoute('DELETE',`/api/v10/guilds/${G}/channels`),false);
assert.equal(isAllowedRoute('PATCH',`/api/v10/guilds/${G}/members`),false);
(async()=>{
 const requests=[];
 const server=makeServer({fetch:async(url,opts)=>{requests.push({url,opts});return new Response(JSON.stringify([{id:R,position:4}]),{status:200,headers:{'Content-Type':'application/json'}});}});
 await new Promise(resolve=>server.listen(17643,'127.0.0.1',resolve));
 const call=(path,method='GET',body)=>fetch(`http://127.0.0.1:17643${path}`,{method,headers:{Authorization:'Bot '+('a'.repeat(36)),Host:'127.0.0.1:17643','X-BotPanel-Bridge':'1','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{
  assert.equal((await call(`/api/v10/guilds/${G}/roles`,'PATCH',[{id:R,position:1}])).status,200);
  assert.equal((await call(`/api/v10/guilds/${G}/channels`,'PATCH',[{id:R,parent_id:null}])).status,200);
  assert.equal((await call(`/api/v10/guilds/${G}/audit-logs?limit=50&action_type=22&before=${R}`)).status,200);
  assert.equal((await call(`/api/v10/guilds/${G}/audit-logs?evil=1`)).status,400);
  assert.equal((await call(`/api/v10/guilds/${G}/members`,'PATCH',{})).status,404);
  assert.deepEqual(JSON.parse(requests[0].opts.body),[{id:R,position:1}]);
  assert.deepEqual(JSON.parse(requests[1].opts.body),[{id:R,parent_id:null}]);
  console.log('OK: v1.12 staged reorder routes and audit parameters');
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
