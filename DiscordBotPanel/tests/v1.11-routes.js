'use strict';
const assert=require('node:assert/strict');
const {isAllowedRoute}=require('../helper/server.js');
const g='123456789012345678', e='234567890123456789';
for(const resource of ['emojis','stickers']){
  assert.equal(isAllowedRoute('GET',`/api/v10/guilds/${g}/${resource}`),true);
  assert.equal(isAllowedRoute('POST',`/api/v10/guilds/${g}/${resource}`),true);
  for(const verb of ['PATCH','DELETE'])assert.equal(isAllowedRoute(verb,`/api/v10/guilds/${g}/${resource}/${e}`),true);
  assert.equal(isAllowedRoute('POST',`/api/v10/guilds/${g}/${resource}/${e}`),false);
}
assert.equal(isAllowedRoute('PUT',`/api/v10/guilds/${g}/emojis/${e}`),false);
assert.equal(isAllowedRoute('POST',`/api/v10/guilds/${g}/members/${e}`),false);
console.log('OK: emoji/sticker routes and negative cases');
