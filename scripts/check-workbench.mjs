import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const readWorkbench = (path) => readFileSync(new URL(`../workbench/${path}`, import.meta.url), 'utf8');
const html = readWorkbench('index.html');
const data = JSON.parse(readWorkbench('data/sample-case.json'));
const dom = new JSDOM(html, {url:'https://reform.test/workbench/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window, d=w.document, results=[];
w.fetch=async()=>({ok:true,json:async()=>data});
w.HTMLElement.prototype.scrollIntoView=function(){};
const blobs=[];
w.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:reform-test';};
w.URL.revokeObjectURL=()=>{};
w.HTMLAnchorElement.prototype.click=function(){};
w.eval(readWorkbench('app.js'));
await new Promise(r=>setTimeout(r,30));
const $=s=>d.querySelector(s);
const click=s=>{assert.ok($(s),s);$(s).click();};
const archive=()=>JSON.parse($('#export-preview').textContent);
function test(name,fn){fn();results.push({name,pass:true});}

test('initial scenario and guided steps',()=>{
  assert.equal($('#sum-gap').textContent,'2 件');
  assert.equal(d.querySelectorAll('.step-panels > .panel:not([hidden])').length,1);
  click('#case-next');assert.equal($('#step-2').hidden,false);
});
test('stock update refreshes passport, gap and focus',()=>{
  const input=$('#inv-MAT-F01');input.focus();input.value='8';input.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal($('#sum-gap').textContent,'0 件');
  assert.match(d.querySelectorAll('.passport')[3].textContent,/当前可用8 件/);
  assert.equal(d.activeElement.id,'inv-MAT-F01');
  assert.equal(archive().inventory[3].currentQuantity,8);
  assert.equal(archive().changeHistory.length,1);
});
test('plan switch changes selected gap and assembly order',()=>{
  click('[data-scenario="initial"]');click('[data-select-plan="PLAN-B"]');
  assert.equal($('#sum-gap').textContent,'0 件');
  click('#asm-next');click('#asm-next');
  assert.equal(d.querySelectorAll('#asm-svg .shape-shell').length,2);
  assert.equal(d.querySelectorAll('#asm-svg .shape-wood').length,0);
  assert.match($('#asm-detail').textContent,/可复用螺栓 × 2/);
});
test('confirmation immediately updates archive and invalidates on inventory change',()=>{
  const cb=$('[data-confirm-step]');cb.checked=true;cb.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(archive().assembly.steps[1].manuallyConfirmed,true);
  const input=$('#inv-MAT-F01');input.value='7';input.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(archive().assembly.steps.some(x=>x.manuallyConfirmed),false);
  assert.match($('#asm-progress-text').textContent,/步骤 0/);
});
test('numeric boundary and reset stop playback state',()=>{
  const input=$('#inv-MAT-F01');input.value='-5';input.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(archive().inventory[3].currentQuantity,0);
  click('#asm-play');click('#reset-case');
  assert.equal($('#asm-play').getAttribute('aria-pressed'),'false');
  assert.equal(archive().inventory[3].currentQuantity,6);
  assert.equal(archive().changeHistory.length,0);
});
test('export blob is generated and checked against displayed values',()=>{
  click('[data-scenario="complete"]');click('#export-json');click('#export-html');
  assert.equal(blobs.length,2);
  assert.equal(archive().selectedPlan.gaps.length,0);
  assert.ok(blobs[0].size>1000);assert.ok(blobs[1].size>1000);
});
test('add two scenario adds to the current inventory',()=>{
  const input=$('#inv-MAT-F01');input.value='20';input.dispatchEvent(new w.Event('change',{bubbles:true}));
  click('[data-scenario="complete"]');
  assert.equal(archive().inventory[3].currentQuantity,22);
});
test('export status describes selected plan and expires when state changes',()=>{
  click('[data-scenario="initial"]');click('[data-select-plan="PLAN-B"]');click('#export-json');
  assert.match($('#export-check').textContent,/所选方案缺口 0 件/);
  const input=$('#inv-MAT-F01');input.value='7';input.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.match($('#export-check').textContent,/重新导出校验/);
  click('[data-scenario="initial"]');
  assert.doesNotMatch($('#case-feedback').textContent,/现有 7 件/);
});
test('all internal links and image alt text resolve',()=>{
  for(const a of d.querySelectorAll('a[href^="#"]'))assert.ok(d.getElementById(a.hash.slice(1)),a.hash);
  for(const im of d.querySelectorAll('img'))assert.ok(im.alt.trim());
  const ids=[...d.querySelectorAll('[id]')].map(n=>n.id);assert.equal(new Set(ids).size,ids.length);
});

console.log(`${results.length} integration checks passed`);
w.close();
