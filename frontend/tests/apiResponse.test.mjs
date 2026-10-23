import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readApiResponse} from '../src/apiResponse.ts';

test('HTML 400 reports host configuration instead of a JSON syntax error', async()=>{
  const res=new Response('<!doctype html><h1>Bad Request</h1>',{status:400,headers:{'Content-Type':'text/html'}});
  await assert.rejects(readApiResponse(res),/ALLOWED_HOSTS/);
});
test('SPA fallback points to the frontend backend URL setting', async()=>{
  await assert.rejects(readApiResponse(new Response('<!doctype html>',{headers:{'Content-Type':'text/html'}})),/VITE_API_URL/);
});
test('preserves game validation messages and parses successful API responses',async()=>{
  await assert.rejects(readApiResponse(Response.json({message:'Phòng đã đầy'},{status:400})),/Phòng đã đầy/);
  assert.deepEqual(await readApiResponse(Response.json({code:'ABCDEF'})),{code:'ABCDEF'});
});
