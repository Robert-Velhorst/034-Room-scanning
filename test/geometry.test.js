import test from 'node:test';
import assert from 'node:assert/strict';
import { demoRoom, normalizeRoomPlan } from '../src/room-data.js';
import { dimensionsFor, hasExitRoute, makeCandidates, makeMovePlan, overlaps, validateLayout } from '../src/geometry.js';

test('normalizes native scan JSON and rejects missing metric room dimensions',()=>{
  const room=normalizeRoomPlan({name:'Office',room:{dimensions:{widthM:4,lengthM:3,heightM:2.5},objects:[{name:'Desk',dimensions:{x:.9,y:.7,z:.5},position:{x:.5,z:.8}}]}});
  assert.equal(room.dimensions.width,4);assert.equal(room.objects[0].depth,.5);assert.equal(room.objects[0].provenance,'measured');
  assert.throws(()=>normalizeRoomPlan({objects:[]}),/width and length/);
});

test('rotated furniture swaps its footprint dimensions and overlaps are detected',()=>{
  const item={x:1,y:1,width:1.4,depth:.6,rotation:90};
  assert.deepEqual(dimensionsFor(item),{w:.6,d:1.4});
  assert.equal(overlaps(item,{x:1.2,y:1.2,width:.5,depth:.5,rotation:0}),true);
});

test('layout candidates honor room boundaries, non-overlap and an exit route',()=>{
  const candidates=makeCandidates(demoRoom,3);
  assert.ok(candidates.length>=3);
  for(const candidate of candidates){assert.equal(validateLayout(demoRoom,candidate.items).valid,true);assert.equal(hasExitRoute(demoRoom,candidate.items,.9),true);}
});

test('move plan only includes changed objects and preserves assisted-lift warnings',()=>{
  const before=[{id:'a',name:'Cabinet',x:0,y:0,rotation:0,moveClass:'assisted'}];
  const after=[{...before[0],x:1}];
  const plan=makeMovePlan(before,after);
  assert.equal(plan.length,1);assert.match(plan[0].caution,/another person/);
  assert.equal(makeMovePlan(after,after).length,0);
});
