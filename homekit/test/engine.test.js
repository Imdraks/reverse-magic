const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LightEngine } = require('../light-engine');
const { PipeTransport } = require('../pipe-transport');
const { PassThrough } = require('node:stream');
test('coalesces Home colour writes and restores last state after reconnect', async () => {
  const frames = []; let connected = true;
  const engine = new LightEngine({ status: async () => ({ connected }), apply: async state => frames.push(state) });
  await engine.refresh(); assert.deepEqual(frames, [], "first connection must not extinguish or reset an unknown controller");
  await Promise.all([engine.set({ on: true }), engine.set({ hue: 120 }), engine.set({ saturation: 100 }), engine.set({ brightness: 42 })]);
  assert.equal(frames.length, 1); assert.deepEqual(frames[0], { on: true, brightness: 42, hue: 120, saturation: 100 });
  connected = false; await assert.rejects(engine.read('on'));
  await assert.rejects(engine.set({ hue: 240 })); assert.equal(engine.state.hue, 120);
  connected = true; await engine.refresh(); assert.deepEqual(frames[1], frames[0]); engine.close();
});
test('rejects invalid state, failed BLE writes, and stopped bridge', async () => {
  let fail = true;
  const engine = new LightEngine({ status: async () => ({ connected: true }), apply: async () => { if (fail) throw new Error('offline'); } });
  for (const patch of [{ hue: NaN }, { on: 'true' }, { brightness: 101 }, { brightness: 1.5 }, { nope: 1 }]) await assert.rejects(engine.set(patch));
  await assert.rejects(engine.set({ on: true })); assert.equal(engine.state.on, false);
  fail = false; await engine.set({ on: true }); assert.equal(engine.state.on, true);
  const pending = engine.set({ on: false }); engine.close(); await assert.rejects(pending); await assert.rejects(engine.read('on'));
});
test('private pipe correlates responses and cancels timed out native requests', async () => {
  const input = new PassThrough(), output = new PassThrough(); const events = [];
  output.on('data', data => events.push(JSON.parse(data.toString())));
  const transport = new PipeTransport(input, output, 30);
  const request = transport.status();
  input.write(JSON.stringify({ kind: 'response', id: events[0].id, ok: true, result: { connected: true } }) + '\n');
  assert.deepEqual(await request, { connected: true });
  await assert.rejects(transport.apply({ on: true })); assert.equal(events.at(-1).kind, 'cancel');
  const pending = transport.status(); transport.close(); await assert.rejects(pending);
});

test('a confirmed BLE write is persisted even if shutdown starts before its save finishes',async()=>{
  let applied,releaseSave;const written=new Promise(resolve=>applied=resolve),saving=new Promise(resolve=>releaseSave=resolve);let remembered;
  const engine=new LightEngine({status:async()=>({connected:true}),apply:async()=>{}},{save:async state=>{applied();await saving;remembered=state;}});
  const pending=engine.set({on:true,hue:240,saturation:100,brightness:23});const failed=assert.rejects(pending);
  await written;engine.close();releaseSave();await engine.settle();await failed;
  assert.deepEqual(remembered,{on:true,hue:240,saturation:100,brightness:23});
});

test('opening a bridge with an existing profile never sends power, colour or reset commands',async()=>{
  const writes=[],state={on:true,brightness:42,hue:120,saturation:80};
  const engine=new LightEngine({status:async()=>({connected:true}),apply:async value=>writes.push(value)},{state,hasSavedState:true});
  await engine.refresh();assert.deepEqual(writes,[]);assert.deepEqual(engine.state,state);engine.close();await engine.settle();assert.deepEqual(writes,[]);
});
