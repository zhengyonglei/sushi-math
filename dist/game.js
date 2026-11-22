'use strict';
const $ = id => document.getElementById(id);
const foods = ['🍣','🍤','🍙','🍥','🥟','🍱'];
const colors = ['#ed896b','#80aea0','#e8bf58','#a59ac8','#7daebd'];
const defaults = { seconds: 10, misses: 3, target: 10 };
function validConfig(c) { return c && Number.isInteger(c.seconds) && c.seconds >= 2 && c.seconds <= 10 && Number.isInteger(c.misses) && c.misses >= 0 && c.misses <= 20 && Number.isInteger(c.target) && c.target >= 1 && c.target <= 100; }
let config = {...defaults};
try { const saved = JSON.parse(localStorage.getItem('sushi-settings-v2')); if(validConfig(saved)) config = saved; } catch {}
let plates=[], selected=null, state='ready', caught=0, missed=0, points=0, streak=0, bestStreak=0, mistakes=[], last=null, spawn=0, countdown=3, previousState='ready', effectTimer;
function bestKey(){ return `sushi-best-${config.seconds}-${config.misses}-${config.target}`; }
function bestScore(){ try {return Number(localStorage.getItem(bestKey()))||0;}catch{return 0;} }
function rememberBest(){try{localStorage.setItem(bestKey(),String(Math.max(bestScore(),points)));}catch{}}
function focusAnswer(){if(matchMedia('(pointer:fine)').matches && state==='playing') $('answer').focus({preventScroll:true});}
function controls(){
  const enabled=state==='playing' && !!selected;
  $('answer').disabled=!enabled; $('grab').disabled=!enabled;
  document.querySelectorAll('#keypad button').forEach(b=>b.disabled=!enabled);
  $('pause').disabled=!['playing','paused','countdown'].includes(state);
  $('pause').textContent=state==='paused'?'▶ Resume':'Ⅱ Pause';
  $('plates').inert=state!=='playing';
}
function updateStats(){
  $('score').textContent=points; $('caught').textContent=`${caught} / ${config.target}`;
  $('missed').textContent=`${missed} / ${config.misses}`;
  $('streak').textContent=streak; $('progress').value=caught; $('progress').max=config.target;
  $('rules').textContent=`${config.seconds}s per plate · ${config.misses} allowed misses · catch ${config.target} to win`;
  $('best').textContent=`Best for these settings: ${bestScore()}`;
}
function choose(p,focus=true){selected=p;plates.forEach(x=>x.el.classList.toggle('selected',x===p));$('question').textContent=p?`${p.a} × ${p.b} =`:'Ready for sushi?';$('answer').value='';controls();if(focus)focusAnswer();}
function position(p){p.el.style.left=`${8+p.progress*84}%`;p.el.classList.toggle('urgent',p.progress>.75);}
function addPlate(){
  const p={a:1+Math.floor(Math.random()*9),b:1+Math.floor(Math.random()*9),progress:0,food:foods[Math.floor(Math.random()*foods.length)]};
  p.el=document.createElement('button');p.el.type='button';p.el.className='plate';p.el.style.setProperty('--rim',colors[Math.floor(Math.random()*colors.length)]);
  p.el.setAttribute('aria-label',`${p.a} times ${p.b}, select sushi plate`);
  p.el.innerHTML=`<span class="problem">${p.a} × ${p.b}</span><span class="food">${p.food}</span>`;
  p.el.onclick=()=>{if(state==='playing')choose(p);};$('plates').append(p.el);plates.push(p);position(p);if(!selected)choose(p,false);return p;
}
function remove(p){p.el.remove();plates=plates.filter(x=>x!==p);if(selected===p)choose(plates[0]||null,false);}
function overlay(html){$('overlay').classList.remove('hidden');$('overlay').innerHTML=`<div class="card">${html}</div>`;}
function ready(){
  clearTimeout(effectTimer);document.querySelectorAll('.spark').forEach(e=>e.remove());$('chef').classList.remove('grab');$('rival').classList.remove('steal');
  plates.forEach(p=>p.el.remove());plates=[];selected=null;state='ready';caught=missed=points=streak=bestStreak=0;mistakes=[];last=null;spawn=0;
  choose(null,false);updateStats();$('timer').textContent='';$('chefLabel').textContent='Ready when you are!';
  $('feedback').textContent='One try per plate. A wrong answer lets another diner take it.';
  overlay(`<div class="emoji">🍣 🥢</div><h1>Ready, little chef?</h1><p>Catch <b>${config.target} plates</b> to win.<br>Each plate takes <b>${config.seconds} seconds</b> to reach the exit.</p><p class="rule-note">${config.misses} misses allowed. Miss number ${config.misses+1} ends the round.<br>Wrong answers and escaped plates both count.</p><button id="start" class="large">Start round</button><p class="rule-note">100 points per catch + a streak bonus of up to 50.</p>`);
  $('start').onclick=start;controls();
}
function start(){if(state!=='ready')return;addPlate();beginCountdown();}
function beginCountdown(){state='countdown';countdown=3;last=null;overlay('<div class="emoji">🥢</div><h1 id="countdownText">3</h1><p>Get your chopsticks ready!</p>');controls();}
function pause(){
  if(!['playing','countdown'].includes(state))return;
  state='paused';last=null;overlay('<div class="emoji">🍵</div><h1>Tea break</h1><p>Take your time. Every plate and timer is frozen.</p><button id="resume" class="large">Resume round</button>');$('resume').onclick=beginCountdown;controls();
}
function animateCatch(p,rival=false){
  const actor=rival?$('rival'):$('chef');actor.classList.add(rival?'steal':'grab');
  clearTimeout(effectTimer);effectTimer=setTimeout(()=>{$('rival').classList.remove('steal');$('chef').classList.remove('grab');},700);
  const s=document.createElement('span');s.className='spark'+(rival?' rival-spark':'');s.textContent=p.food;document.querySelector('.room').append(s);setTimeout(()=>s.remove(),900);
}
function end(won){
  state=won?'won':'lost';last=null;rememberBest();updateStats();controls();$('timer').textContent='Round finished';
  const facts=[...new Set(mistakes.map(p=>`${p.a} × ${p.b} = ${p.a*p.b}`))];
  overlay(`<div class="emoji">${won?'🏆':'🍵'}</div><h1>${won?'Mission complete!':'Mission over'}</h1><p>${won?`You caught all ${config.target} plates!`:`You missed ${missed} plates. The limit was ${config.misses}.`}</p><div class="result-score">${points} <span>points</span></div><p>${caught} caught · ${missed} missed · best streak ${bestStreak}</p>${facts.length?`<details><summary>Practice ${facts.length} tricky fact${facts.length===1?'':'s'}</summary><div class="review">${facts.map(f=>`<span>${f}</span>`).join('')}</div></details>`:'<p>Perfect catches. Nicely done!</p>'}<button id="again" class="large">Start fresh</button><p class="rule-note">Reset first, then press Start round when ready.</p>`);
  $('again').onclick=ready;$('again').focus({preventScroll:true});
}
function missPlate(p,wrong){
  missed++;streak=0;mistakes.push({a:p.a,b:p.b});
  if(wrong){animateCatch(p,true);$('rivalLabel').textContent='I’ll take that!';}
  $('feedback').textContent=wrong?`Another diner took it! ${p.a} × ${p.b} = ${p.a*p.b}.`:`It sailed away! ${p.a} × ${p.b} = ${p.a*p.b}.`;
  remove(p);updateStats();if(missed>config.misses)end(false);else ensurePlate();
}
function ensurePlate(){if(state==='playing'&&!plates.length){addPlate();spawn=0;}}
function answer(){
  if(state!=='playing'||!selected||!/^\d{1,2}$/.test($('answer').value))return;
  const p=selected;
  if(Number($('answer').value)!==p.a*p.b){missPlate(p,true);focusAnswer();return;}
  caught++;streak++;bestStreak=Math.max(bestStreak,streak);const earned=100+Math.min(streak-1,5)*10;points+=earned;
  animateCatch(p);$('chefLabel').textContent='Delicious!';$('feedback').textContent=`${p.a} × ${p.b} = ${p.a*p.b}. +${earned} points!`;
  remove(p);updateStats();if(caught>=config.target)end(true);else{ensurePlate();focusAnswer();}
}
function openSettings(){
  if($('configDialog').open)return;
  previousState=state;if(state==='playing'||state==='countdown'){state='paused';last=null;controls();}
  $('seconds').value=config.seconds;$('allowedMisses').value=config.misses;$('target').value=config.target;settingLabels();
  $('saveSettings').textContent=['playing','paused','countdown'].includes(previousState)?'Save & reset round':'Save settings';
  $('configDialog').showModal();
}
function closeSettings(){
  $('configDialog').close();state=previousState;last=null;
  if(state==='playing'){beginCountdown();}else{controls();}
  if(document.hidden&&['playing','countdown'].includes(state))pause();
}
function settingLabels(){$('secondsValue').textContent=`${$('seconds').value} seconds`;$('missHelp').textContent=`The round ends on miss ${Number($('allowedMisses').value)+1}.`;}
$('settings').onclick=openSettings;$('cancelSettings').onclick=closeSettings;
$('configDialog').addEventListener('cancel',e=>{e.preventDefault();closeSettings();});
$('seconds').oninput=settingLabels;$('allowedMisses').oninput=settingLabels;
$('configForm').onsubmit=e=>{e.preventDefault();const c={seconds:Number($('seconds').value),misses:Number($('allowedMisses').value),target:Number($('target').value)};if(!validConfig(c))return;config=c;try{localStorage.setItem('sushi-settings-v2',JSON.stringify(config));}catch{}$('configDialog').close();ready();};
$('reset').onclick=ready;$('pause').onclick=()=>state==='paused'?beginCountdown():pause();
$('answerForm').onsubmit=e=>{e.preventDefault();answer();};
$('answer').addEventListener('input',()=>{$('answer').value=$('answer').value.replace(/\D/g,'').slice(0,2);});
for(const key of ['1','2','3','4','5','6','7','8','9','Clear','0','⌫']){const b=document.createElement('button');b.type='button';b.textContent=key;if(key==='⌫')b.setAttribute('aria-label','Delete last digit');b.onclick=()=>{if(state!=='playing'||!selected)return;const field=$('answer');field.value=key==='Clear'?'':key==='⌫'?field.value.slice(0,-1):(field.value+key).slice(0,2);};$('keypad').append(b);}
document.addEventListener('keydown',e=>{
  if($('configDialog').open)return;
  if(e.key==='Escape'){e.preventDefault();if(state==='paused')beginCountdown();else pause();return;}
  if(state!=='playing'||e.target===$('answer'))return;
  if(/^\d$/.test(e.key)){e.preventDefault();$('answer').value=($('answer').value+e.key).slice(0,2);}
  if(e.key==='Backspace'){e.preventDefault();$('answer').value=$('answer').value.slice(0,-1);}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();}});
function advance(dt){
  if($('configDialog').open)return;
  if(state==='countdown'){
    countdown-=dt;if(countdown<=0){state='playing';last=null;$('overlay').classList.add('hidden');controls();focusAnswer();}else $('countdownText').textContent=Math.ceil(countdown);return;
  }
  if(state!=='playing')return;
  spawn+=dt;
  for(const p of [...plates]){p.progress+=dt/config.seconds;position(p);if(p.progress>=1){missPlate(p,false);if(state!=='playing')break;}}
  if(state!=='playing')return;
  if(spawn>=config.seconds*.55&&plates.length<2){addPlate();spawn=0;}
  ensurePlate();
  if(selected){$('timer').textContent=`${Math.max(0,(1-selected.progress)*config.seconds).toFixed(1)}s left`;$('timebar').style.width=`${Math.max(0,1-selected.progress)*100}%`;}
}
function frame(t){const dt=last===null?0:Math.max(0,(t-last)/1000);last=t;advance(dt);requestAnimationFrame(frame);}
ready();requestAnimationFrame(frame);
