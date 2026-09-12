import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Run the actual audio lifecycle with controllable Web Audio promises. This
// reproduces interruption and late-resume races without needing an iPhone.
const game=await readFile(new URL('./game.js',import.meta.url),'utf8');
const block=game.slice(game.indexOf('// AUDIO START'),game.indexOf('// AUDIO END'));
const contexts=[],buttons=new Map(),timers=[];
let rejectResume=false,stored=null;
function node(){return {gain:{value:0,setValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(){},setTargetAtTime(v){this.value=v;}},frequency:{value:0,setTargetAtTime(v){this.value=v;}},connect(){return this;},start(){},stop(){},disconnect(){}};}
class AudioContext {
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};contexts.push(this);}
  decodeAudioData(){return Promise.resolve({duration:3});}
  createGain(){return node();}createBiquadFilter(){return node();}createOscillator(){return node();}createBufferSource(){return node();}
  createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
  resume(){this.resumeCalled=true;return new Promise((resolve,reject)=>{this.complete=()=>{if(rejectResume)reject(new Error('Blocked'));else{this.state='running';resolve();}};});}
  suspend(){this.state='suspended';return Promise.resolve();}
  close(){this.closed=true;this.state='closed';return Promise.resolve();}
}
const sandbox=vm.createContext({Float32Array,Math,Promise,Date,console,state:{captionTime:0},fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}),window:{AudioContext},navigator:{audioSession:{}},localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},setTimeout:callback=>{timers.push(callback);return timers.length-1;},clearTimeout:id=>timers[id]=null,caption:()=>{},$:(id)=>{if(!buttons.has(id))buttons.set(id,{setAttribute(){},textContent:''});return buttons.get(id);}});
vm.runInContext('let audio=null,soundOn=true,rainGain=null;'+block,sandbox);
const run=code=>vm.runInContext(code,sandbox);
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
assert.equal(contexts.length,0,'Preparing samples does not create or play an AudioContext');
run('ensureAudio()');assert(contexts[0].resumeCalled,'Resume is called synchronously in the gesture');
contexts[0].complete();await flush();assert.equal(buttons.get('hud-sound').textContent,'SOUND ON');
run('stopAudio();ensureAudio();toggleSound()');contexts[0].complete();await flush();
assert.equal(run('masterGain.gain.value'),0,'Late resume cannot unmute after a mute tap');
assert.equal(buttons.get('hud-sound').textContent,'SOUND OFF');
run('toggleSound()');contexts[0].complete();await flush();
contexts[0].state='interrupted';run('ensureAudio()');assert.equal(contexts.length,2);assert(contexts[0].closed,'Interrupted context is retired');
rejectResume=true;contexts[1].complete();await flush();assert.equal(buttons.get('hud-sound').textContent,'TAP FOR SOUND');
rejectResume=false;run('toggleSound()');contexts[2].complete();await flush();assert.equal(buttons.get('hud-sound').textContent,'SOUND ON');
run('stopAudio();ensureAudio()');timers.filter(Boolean).at(-1)();assert.equal(buttons.get('hud-sound').textContent,'TAP FOR SOUND','Hung resume exposes recovery');
console.log('Audio lifecycle passed: prewarm, gesture unlock, mute race, interruption, rejected resume, retry and timeout.');

run('ensureAudio()');contexts.at(-1).complete();
for(let i=0;i<8;i++)await flush();
run("say('escort')");assert(run('activeVoice!==null'),'Guard dialogue starts an audio source');
run('stopAudio()');assert.equal(run('activeVoice'),null,'Pause/mute cancels dialogue');
const far=run('musicSettings({x:-5,z:0},false)');
const near=run('musicSettings({x:1,z:5},false)');
const open=run('musicSettings({x:1,z:5},true)');
assert(near.gain>far.gain*3,'Music grows louder approaching the door');
assert(open.gain>near.gain&&open.cutoff>near.cutoff,'Opening the door unmuffles music');
for(const id of ['welcome','escort','hold','warning','incoming','waiting','secure']){
  const wav=await readFile(new URL(`./voices/${id}.wav`,import.meta.url));
  assert.equal(wav.toString('ascii',0,4),'RIFF');
  assert(wav.length>10000,`${id} includes recorded dialogue`);
}
console.log('Dialogue playback/cancellation, door proximity and seven local WAV clips passed.');