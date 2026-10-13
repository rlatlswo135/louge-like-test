import test from 'node:test';
import assert from 'node:assert/strict';
import { runPerformance } from '../scripts/qa-scenarios.mjs';

const hardware = () => ({
  headed: true, focusEmulated: false,
  system: { gpu: { devices: [{ deviceString: 'ANGLE Metal Renderer: Apple M4' }], featureStatus: { gpu_compositing: 'enabled', '2d_canvas': 'enabled' } } },
});

test('performance gate rejects headless, emulated or unreported focus, and software GPU before sampling', async (t) => {
  t.mock.method(console, 'log', () => {});
  const unavailable = { send: () => { throw new Error('must not sample invalid environment'); } };
  for (const change of [{ headed: false }, { focusEmulated: true }, { focusEmulated: undefined },
    { system: { gpu: { devices: [{ deviceString: 'SwiftShader' }] } } },
    { system: { gpu: { ...hardware().system.gpu, featureStatus: { gpu_compositing: 'disabled_software', '2d_canvas': 'disabled_software' } } } }]) {
    await assert.rejects(runPerformance(unavailable, { ...hardware(), ...change }), /requires --headed/);
  }
});

test('performance gate stops on real focus loss instead of measuring paused or background frames', async (t) => {
  t.mock.method(console, 'log', () => {});
  const input=[];
  const page = { send: async (method, { expression,type }) => {
    if(method==='Input.dispatchMouseEvent'){input.push(type);return {};}
    assert.equal(method, 'Runtime.evaluate');
    let value;
    if(expression==='__qa.app.screen==="home"')value=true;
    else if(expression.includes('getBoundingClientRect'))value={x:100,y:100};
    else if (expression === 'document.hasFocus() && document.visibilityState === "visible"') value = true;
    else if (expression === '__qa.snapshot()') value = { screen: 'start' };
    else if (expression.startsWith('({focus:')) value = { focus: false, visibility: 'visible', screen: 'pause' };
    else assert.match(expression, /home-start|start-motion|__qa.startLoad/);
    return { result: { value } };
  } };
  const report = hardware();
  await assert.rejects(runPerformance(page, report), /keep the QA Chrome window in foreground/);
  assert.deepEqual(report.workloads, []);
  assert.deepEqual(input,['mousePressed','mouseReleased'],'performance warmup unlocks audio through a real gesture');
});
