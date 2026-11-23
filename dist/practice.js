'use strict';
const $=id=>document.getElementById(id), TOTAL=20;
const foods=['🍣','🍤','🍙','🍥','🥟','🍱'], rims=['#ed896b','#80aea0','#e8bf58','#a59ac8','#7daebd'];
// Owner-requested cleanup of pre-launch test progress, November 22, 2026.
const TEST_RESET_BEFORE='2026-11-23T03:23:06.000Z';
const afterTestReset=s=>Date.parse(s?.startedAt)>=Date.parse(TEST_RESET_BEFORE);
const freshData=()=>({version:1,settings:{seconds:15},sessions:[],active:null});
let data=freshData(), db=null, storageMode='memory', saveQueue=Promise.resolve(), saveRevision=0;
let session=null, plates=[], selected=null, state='loading', last=null, countdown=3, spawnWait=0, draftClock=0, corrections=[], modalPrevious='ready', animationTimer;
const keyOf=p=>[p.a,p.b].sort((a,b)=>a-b).join('x');
const correctCount=s=>s.attempts.filter(a=>a.result==='correct').length;
const percent=s=>Math.round(correctCount(s)/TOTAL*100);
const paceValid=n=>Number.isInteger(n)&&n>=8&&n<=30;
const factValid=p=>p&&Number.isInteger(p.a)&&p.a>=1&&p.a<=9&&Number.isInteger(p.b)&&p.b>=1&&p.b<=9;
const dateValid=s=>typeof s==='string'&&s.length<=40&&Number.isFinite(Date.parse(s));
function normalizeSession(s,complete){
  if(!s||typeof s.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(s.id)||!dateValid(s.startedAt)||!paceValid(s.seconds)||!Array.isArray(s.plan)||s.plan.length!==TOTAL||!s.plan.every(factValid)||!Array.isArray(s.attempts)||s.attempts.length>TOTAL||(complete&&s.attempts.length!==TOTAL))throw Error('Invalid session');
  const plan=s.plan.map((p,i)=>({a:p.a,b:p.b,food:Number.isInteger(p.food)&&p.food>=0&&p.food<foods.length?p.food:i%foods.length}));
  const ids=new Set();const attempts=s.attempts.map(a=>{
    if(!Number.isInteger(a.index)||a.index<0||a.index>=TOTAL||ids.has(a.index)||!['correct','wrong','unanswered'].includes(a.result))throw Error('Invalid answer record');ids.add(a.index);
    const p=plan[a.index];if(a.result==='unanswered'){if(a.answer!==null)throw Error('Invalid unanswered record');}else if(!Number.isInteger(a.answer)||a.answer<0||a.answer>99||(a.answer===p.a*p.b)!==(a.result==='correct'))throw Error('Invalid answer');
    return {index:a.index,a:p.a,b:p.b,answer:a.answer,result:a.result};
  });
  const clean={id:s.id,startedAt:s.startedAt,seconds:s.seconds,plan,attempts};
  if(complete){if(!dateValid(s.completedAt))throw Error('Invalid completion date');clean.completedAt=s.completedAt;}
  else{
    const maxAnswered=attempts.length?Math.max(...attempts.map(a=>a.index))+1:0;
    clean.next=Number.isInteger(s.next)&&s.next>=maxAnswered&&s.next<=TOTAL?s.next:maxAnswered;
    clean.positions=Array.isArray(s.positions)?s.positions.filter(p=>Number.isInteger(p.index)&&p.index>=0&&p.index<clean.next&&Number.isFinite(p.progress)&&p.progress>=0&&p.progress<1).map(p=>({index:p.index,progress:p.progress})).filter((p,i,arr)=>arr.findIndex(x=>x.index===p.index)===i):[];
    // Any unanswered plate missing from a saved snapshot returns at the kitchen.
    for(let i=0;i<clean.next;i++)if(!ids.has(i)&&!clean.positions.some(p=>p.index===i))clean.positions.push({index:i,progress:0});
    clean.wait=Number.isFinite(s.wait)?Math.max(0,Math.min(s.wait,s.seconds)):0;
  }
  return clean;
}
function normalizeBackup(raw){
  if(!raw||raw.version!==1||!Array.isArray(raw.sessions)||raw.sessions.length>5000)throw Error('This is not a supported Sushi Math backup.');
  const sessions=raw.sessions.map(s=>normalizeSession(s,true)).filter(afterTestReset);const unique=new Map(sessions.map(s=>[s.id,s]));
  return {version:1,settings:{seconds:paceValid(raw.settings?.seconds)?raw.settings.seconds:15},sessions:[...unique.values()].sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt)),active:raw.active&&afterTestReset(raw.active)?normalizeSession(raw.active,false):null};
}
function status(message,error=false){$('storageStatus').textContent=message;$('storageStatus').classList.toggle('storage-error',error);}
async function openStorage(){
  try{
    db=await new Promise((resolve,reject)=>{const request=indexedDB.open('sushi-math-learning',1);request.onupgradeneeded=()=>request.result.createObjectStore('app');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Storage blocked'));});
    const value=await new Promise((resolve,reject)=>{const tx=db.transaction('app','readonly');const r=tx.objectStore('app').get('progress');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    if(value)data=normalizeBackup(value);storageMode='indexeddb';status('Progress saves automatically on this device.');
  }catch{
    try{const value=localStorage.getItem('sushi-learning-backup-v1');if(value)data=normalizeBackup(JSON.parse(value));localStorage.setItem('sushi-learning-storage-check','ok');localStorage.removeItem('sushi-learning-storage-check');storageMode='local';status('Progress saves in this browser. Sign in to keep it online.');}
    catch{storageMode='memory';status('Browser storage is unavailable. Sign in and wait for Saved online before closing.',true);}
  }
}
function snapshot(){
  if(session&&['playing','paused','countdown'].includes(state)){session.positions=plates.map(p=>({index:p.index,progress:p.progress}));session.wait=spawnWait;data.active=session;}
  return JSON.parse(JSON.stringify(data));
}
function save(notifyCloud=true){
  const value=snapshot(),revision=++saveRevision;
  if(notifyCloud)window.sushiCloud?.schedule();
  saveQueue=saveQueue.then(async()=>{
    try{
      if(storageMode==='indexeddb')await new Promise((resolve,reject)=>{const tx=db.transaction('app','readwrite');tx.objectStore('app').put(value,'progress');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
      else if(storageMode==='local')localStorage.setItem('sushi-learning-backup-v1',JSON.stringify(value));else throw Error('No storage');
      if(revision===saveRevision)status('Saved on this device.');
    }catch{status('Local saving failed. Check that cloud saving says Saved online before closing.',true);}
  });return saveQueue;
}
function factStats(){
  const stats=new Map();for(const s of data.sessions)for(const a of s.attempts){const k=keyOf(a);const f=stats.get(k)||{a:Math.min(a.a,a.b),b:Math.max(a.a,a.b),tries:0,misses:0,recovery:0};f.tries++;if(a.result==='correct')f.recovery++;else{f.misses++;f.recovery=0;}stats.set(k,f);}return [...stats.values()];
}
function shuffled(values){const arr=[...values];for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function makePlan(){
  const easy=[],hard=[];for(let a=1;a<=9;a++)for(let b=a;b<=9;b++)(a<=5&&b<=6?easy:hard).push({a,b});
  const tricky=shuffled(factStats().filter(f=>f.misses&&f.recovery<2));const chosen=[],used=new Set();
  function take(list,count){let n=0;for(const p of shuffled(list)){if(n>=count)break;const key=keyOf(p);if(!used.has(key)){chosen.push({a:p.a,b:p.b});used.add(key);n++;}}}
  take(tricky,6);take(easy,10);take(hard,TOTAL-chosen.length);take([...easy,...hard],TOTAL-chosen.length);
  return shuffled(chosen).map(p=>{if(Math.random()<.5)[p.a,p.b]=[p.b,p.a];return {...p,food:Math.floor(Math.random()*foods.length)};});
}
function hasDialog(){return ['settingsDialog','historyDialog'].some(id=>$(id).open);}
function controls(){const enabled=state==='playing'&&selected&&!hasDialog();$('answer').disabled=!enabled;$('grab').disabled=!enabled;document.querySelectorAll('#keypad button').forEach(b=>b.disabled=!enabled);$('pause').disabled=!['playing','paused','countdown'].includes(state)||hasDialog();$('pause').textContent=state==='paused'?'▶ Resume':'Ⅱ Pause';$('plates').inert=state!=='playing'||hasDialog();document.querySelector('.room').classList.toggle('moving',state==='playing'&&!hasDialog());document.querySelector('.room').classList.toggle('motion-paused',state!=='playing'||hasDialog());}
function updateStats(){const attempts=session?.attempts||[];$('answered').textContent=`${attempts.length} / 20`;$('caught').textContent=session?correctCount(session):0;$('progress').value=attempts.length;$('sessionTitle').textContent=state==='finished'?'You showed up and practiced.':'20 questions. Room to learn.';}
function choose(p){selected=p;plates.forEach(x=>x.el.classList.toggle('selected',x===p));$('question').textContent=p?`${p.a} × ${p.b} =`:'More sushi on the way…';$('plateNumber').textContent=p?`Plate ${p.index+1} of 20`:'';$('answer').value='';controls();}
function nextSelection(){choose(plates.find(p=>!p.result)||null);}
function overlay(html){$('overlay').classList.remove('hidden');$('overlay').innerHTML=`<div class="card">${html}</div>`;}
function cleanup(){plates.forEach(p=>p.el.remove());plates=[];selected=null;$('effects').innerHTML='';$('plateStack').innerHTML='';$('chef').classList.remove('eating','teaching');clearTimeout(animationTimer);$('chopsticks').getAnimations().forEach(a=>a.cancel());}
function ready(){cleanup();state='ready';session=null;last=null;spawnWait=0;corrections=[];choose(null);$('question').textContent='Ready for sushi?';$('chefLabel').textContent='Let’s learn together';$('feedbackTitle').textContent='Mistakes are part of learning.';$('feedback').textContent='Corrections stay here while the sushi keeps rolling.';$('recentFacts').innerHTML='';updateStats();
  const pending=data.active;
  overlay(`<div class="emoji">🍣 🌱</div><h2>${pending?'Welcome back, little chef!':'A little practice, a little progress.'}</h2><p>${pending?`${pending.attempts.length} of 20 questions saved. Pick up where you left off.`:`Try 20 questions at your own pace.<br>The sushi rolls for ${data.settings.seconds} seconds per plate.`}</p><p>No lives to lose. Every mistake is a chance to learn.</p><button id="start" class="large">${pending?'Resume practice':'Start practice'}</button><small>Your first-try accuracy is saved after each session.</small>`);
  $('start').onclick=start;controls();
}
function position(p){p.el.style.left=`${16+p.progress*68}%`;}
function renderPlate(index,progress=0){const f=session.plan[index],attempt=session.attempts.find(a=>a.index===index);if(attempt?.result==='correct')return null;const p={...f,index,progress,result:attempt?.result||null};p.el=document.createElement('button');p.el.type='button';p.el.className='plate';p.el.style.setProperty('--rim',rims[index%rims.length]);p.el.innerHTML=`<span class="problem">${p.a} × ${p.b}${p.result?` = ${p.a*p.b}`:''}</span><span class="food">${foods[p.food]}</span>`;p.el.setAttribute('aria-label',p.result?`${p.a} times ${p.b} equals ${p.a*p.b}`:`${p.a} times ${p.b}, select sushi plate`);p.el.classList.toggle('resolved',!!p.result);p.el.onclick=()=>{if(state==='playing'&&!p.result)choose(p);};$('plates').append(p.el);plates.push(p);position(p);if(!selected&&!p.result)choose(p);return p;}
function addPlate(){if(!session||session.next>=TOTAL)return;renderPlate(session.next++);spawnWait=0;}
function removePlate(p){p.el.remove();plates=plates.filter(x=>x!==p);if(selected===p)nextSelection();}
function start(){if(state!=='ready')return;cleanup();session=data.active?normalizeSession(data.active,false):{id:crypto.randomUUID(),startedAt:new Date().toISOString(),seconds:data.settings.seconds,plan:makePlan(),attempts:[],next:0,positions:[],wait:0};data.active=session;spawnWait=session.wait||0;session.positions.forEach(p=>renderPlate(p.index,p.progress));if(!plates.length&&session.next<TOTAL)addPlate();corrections=session.attempts.filter(a=>a.result!=='correct').slice(-3);if(corrections.length)showCorrection(corrections.at(-1),false);renderStack();updateStats();if(session.attempts.length===TOTAL){finish();return;}beginCountdown();save();}
function beginCountdown(){state='countdown';countdown=3;last=null;overlay('<div class="emoji">🥢</div><h2 id="countdownText">3</h2><p>A fresh bite of practice.</p>');controls();}
function pause(){if(!['playing','countdown'].includes(state))return;state='paused';last=null;overlay('<div class="emoji">🍵</div><h2>Take a little tea break.</h2><p>The belt and every plate are paused.<br>Come back whenever you’re ready.</p><button id="resume" class="large">Resume practice</button>');$('resume').onclick=beginCountdown;controls();save();}
function explanation(p){if(p.a>5)return `${p.a} groups of ${p.b}: 5 × ${p.b} = ${5*p.b}, plus ${p.a-5} × ${p.b} = ${(p.a-5)*p.b}. Together, ${p.a*p.b}.`;return `${p.a} groups of ${p.b}: ${Array(p.a).fill(p.b).join(' + ')} = ${p.a*p.b}.`;}
function showCorrection(p,add=true){if(add){corrections.push({a:p.a,b:p.b});corrections=corrections.slice(-3);}$('feedbackTitle').textContent=`Let’s remember: ${p.a} × ${p.b} = ${p.a*p.b}`;$('feedback').textContent=explanation(p);$('recentFacts').innerHTML=corrections.map(f=>`<span>${f.a} × ${f.b} = ${f.a*f.b}</span>`).join('');$('chefLabel').textContent='We’re learning this one';$('chef').classList.remove('eating');$('chef').classList.add('teaching');clearTimeout(animationTimer);animationTimer=setTimeout(()=>$('chef').classList.remove('teaching'),1500);}
function renderStack(){const n=session?correctCount(session):0;$('plateStack').innerHTML=Array.from({length:Math.min(n,12)},(_,i)=>`<i style="--i:${i};--rim:${rims[i%rims.length]}"></i>`).join('');}
function animateCatch(p){
  const room=document.querySelector('.room'),w=room.clientWidth;const x=w*(.16+p.progress*.68),endX=w*.46;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('chefLabel').textContent='Mmm, nicely done!';$('chef').classList.remove('teaching');$('chef').classList.add('eating');clearTimeout(animationTimer);animationTimer=setTimeout(()=>$('chef').classList.remove('eating'),1600);
  if(reduced)return;
  $('chopsticks').animate([{opacity:0,left:'46%',top:'263px',transform:'rotate(-25deg)'},{opacity:1,left:`${x}px`,top:'130px',transform:'rotate(10deg)',offset:.45},{opacity:1,left:'46%',top:'263px',transform:'rotate(-25deg)'},{opacity:0}],{duration:900,easing:'ease-in-out'});
  const food=document.createElement('span');food.className='flying-food';food.textContent=foods[p.food];food.style.left=`${x-18}px`;food.style.top='135px';$('effects').append(food);const animation=food.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${endX-x}px,135px) scale(.55)`,opacity:0}],{duration:850,delay:250,easing:'ease-in-out',fill:'forwards'});animation.onfinish=()=>food.remove();
}
function record(p,result,answer=null){if(state!=='playing'||p.result||session.attempts.some(a=>a.index===p.index))return;p.result=result;session.attempts.push({index:p.index,a:p.a,b:p.b,answer,result});
  if(result==='correct'){animateCatch(p);removePlate(p);renderStack();if(!corrections.length){$('feedbackTitle').textContent=`Yes! ${p.a} × ${p.b} = ${p.a*p.b}`;$('feedback').textContent='One more fact practiced. Keep going!';}}
  else{showCorrection(p);p.el.classList.add('resolved');p.el.querySelector('.problem').textContent=`${p.a} × ${p.b} = ${p.a*p.b}`;p.el.setAttribute('aria-label',`${p.a} times ${p.b} equals ${p.a*p.b}`);nextSelection();}
  updateStats();save();if(session.attempts.length===TOTAL){finish();return;}if(!plates.length&&session.next<TOTAL)addPlate();
}
function submitAnswer(){if(state!=='playing'||hasDialog()||!selected||!/^\d{1,2}$/.test($('answer').value))return;const n=Number($('answer').value),p=selected;record(p,n===p.a*p.b?'correct':'wrong',n);if(matchMedia('(pointer:fine)').matches&&!$('answer').disabled)$('answer').focus({preventScroll:true});}
function finish(){
  state='finished';last=null;session.completedAt=new Date().toISOString();const complete=normalizeSession(session,true);if(!data.sessions.some(s=>s.id===complete.id))data.sessions.push(complete);data.sessions.sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));data.active=null;updateStats();controls();save();
  const samePace=data.sessions.filter(s=>s.id!==session.id&&s.seconds===session.seconds),previous=samePace.at(-1);const delta=previous?percent(session)-percent(previous):null;
  const encouragement=delta>0?`That’s ${delta} percentage points above your last session at this pace.`:'You practiced 20 facts. That’s time well spent.';
  overlay(`<div class="emoji">🍣 ✨</div><h2>Practice complete!</h2><div class="result">${percent(session)}%</div><p>${correctCount(session)} of 20 correct on the first try.</p><small>${encouragement}</small><div class="button-row"><button id="seeProgress">See my progress</button><button id="again" class="soft">Practice again</button></div><small>Wrong answers and unanswered plates stay in your learning history.</small>`);
  $('seeProgress').onclick=()=>openDialog('historyDialog');$('again').onclick=ready;
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(let i=0;i<22;i++){const e=document.createElement('i');e.className='confetti';e.style.setProperty('--x',`${Math.random()*100}%`);e.style.setProperty('--color',rims[i%rims.length]);e.style.setProperty('--delay',`${Math.random()*.5}s`);$('effects').append(e);setTimeout(()=>e.remove(),3500);}
}
function advance(dt){
  if(hasDialog())return;
  if(state==='countdown'){countdown-=dt;if(countdown<=0){state='playing';last=null;$('overlay').classList.add('hidden');controls();}else $('countdownText').textContent=Math.ceil(countdown);return;}
  if(state!=='playing')return;spawnWait+=dt;draftClock+=dt;
  for(const p of [...plates]){p.progress+=dt/session.seconds;position(p);if(p.progress>=1){if(!p.result){record(p,'unanswered');const note=document.createElement('div');note.className='exit-answer';note.textContent=`${p.a} × ${p.b} = ${p.a*p.b}`;$('effects').append(note);setTimeout(()=>note.remove(),3000);}removePlate(p);if(state!=='playing')break;}}
  if(state==='playing'&&session.next<TOTAL&&plates.length<2&&(spawnWait>=session.seconds*.7||plates.length===0))addPlate();
  if(draftClock>=2){draftClock=0;save();}
}
function frame(t){const dt=last===null?0:Math.max(0,(t-last)/1000);last=t;advance(dt);requestAnimationFrame(frame);}
function renderHistory(){
  const all=data.sessions;if(!all.length){$('historyContent').innerHTML='<div class="empty"><h3>Your story starts here.</h3><p>Finish a 20-question session to see your first point on the chart. No old scores have been guessed or converted.</p></div>';return;}
  const recent=all.slice(-5),avg=Math.round(recent.reduce((n,s)=>n+percent(s),0)/recent.length),display=all.slice(-20),offset=all.length-display.length;
  const x=i=>56+(display.length===1?284:i/(display.length-1)*568),y=n=>220-n*1.8;
  const lines=display.map((s,i)=>`${x(i)},${y(percent(s))}`).join(' ');
  const grid=[0,25,50,75,100].map(n=>`<line x1="56" x2="624" y1="${y(n)}" y2="${y(n)}" stroke="#e0e6d8"/><text x="45" y="${y(n)+5}" text-anchor="end">${n}%</text>`).join('');
  const points=display.map((s,i)=>`<circle cx="${x(i)}" cy="${y(percent(s))}" r="5" fill="#32715b"><title>Session ${offset+i+1}: ${percent(s)}%, ${s.seconds} seconds per plate</title></circle>`).join('');
  const labels=display.map((s,i)=>i===0||i===display.length-1||display.length<=6?`<text x="${x(i)}" y="246" text-anchor="middle">${offset+i+1}</text>`:'').join('');
  const tricky=factStats().filter(f=>f.misses&&f.recovery<2).sort((a,b)=>b.misses-a.misses).slice(0,12);
  $('historyContent').innerHTML=`<div class="history-summary"><div><strong>${all.length}</strong><span>sessions finished</span></div><div><strong>${all.length*20}</strong><span>facts practiced</span></div><div><strong>${avg}%</strong><span>last ${recent.length} session${recent.length===1?'':'s'} average</span></div></div><h3>First-try accuracy</h3><svg class="chart" viewBox="0 0 660 285" role="img" aria-label="Accuracy by session, from zero to one hundred percent. Exact values appear in the table below.">${grid}<polyline points="${lines}" fill="none" stroke="#32715b" stroke-width="3"/>${points}${labels}<text x="340" y="274" text-anchor="middle">Session number</text></svg><p class="help">Showing the latest ${display.length} sessions. Pace and question mix can change, so an occasional dip is normal.</p><details><summary>Session details and exact scores</summary><div class="chart-table"><table><thead><tr><th>Session</th><th>Date</th><th>Accuracy</th><th>Pace</th></tr></thead><tbody>${display.map((s,i)=>`<tr><td>${offset+i+1}</td><td>${new Date(s.startedAt).toLocaleDateString()}</td><td>${correctCount(s)}/20 · ${percent(s)}%</td><td>${s.seconds}s</td></tr>`).join('')}</tbody></table></div></details>${tricky.length?`<h3>Facts we’re still learning</h3><p class="help">A few of these will return in future sessions, mixed with familiar facts.</p><div class="fact-chips">${tricky.map(f=>`<span>${f.a} × ${f.b} = ${f.a*f.b}</span>`).join('')}</div>`:'<p>Keep practicing to build your familiarity with each fact.</p>'}`;
}
function openDialog(id){if(state==='loading'||hasDialog())return;modalPrevious=state;if(['playing','countdown'].includes(state))pause();if(id==='historyDialog')renderHistory();if(id==='settingsDialog'){$('seconds').value=data.settings.seconds;$('secondsValue').textContent=`${data.settings.seconds} seconds`;$('settingsNote').textContent=session&&state!=='finished'?'A new pace applies to your next session. This session keeps its current pace.':'Your next session will use this pace.';}$(id).showModal();controls();}
function closeDialog(id){$(id).close();if(['playing','countdown'].includes(modalPrevious)&&state==='paused'&&!document.hidden)beginCountdown();else controls();}
function mergeBackup(incoming){const ids=new Set(data.sessions.map(s=>s.id));let count=0;for(const s of incoming.sessions)if(!ids.has(s.id)){data.sessions.push(s);ids.add(s.id);count++;}data.sessions.sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));if(!data.active&&incoming.active&&!ids.has(incoming.active.id)){data.active=incoming.active;if(state==='ready')ready();}return count;}
function wire(){
  $('answerForm').onsubmit=e=>{e.preventDefault();submitAnswer();};$('answer').oninput=()=>{$('answer').value=$('answer').value.replace(/\D/g,'').slice(0,2);};
  for(const key of ['1','2','3','4','5','6','7','8','9','Clear','0','⌫']){const b=document.createElement('button');b.type='button';b.textContent=key;b.dataset.key=key;if(key==='⌫')b.setAttribute('aria-label','Delete last digit');b.onclick=()=>{if(state!=='playing'||!selected||hasDialog())return;$('answer').value=key==='Clear'?'':key==='⌫'?$('answer').value.slice(0,-1):($('answer').value+key).slice(0,2);};$('keypad').append(b);}
  $('pause').onclick=()=>state==='paused'?beginCountdown():pause();$('historyButton').onclick=()=>openDialog('historyDialog');$('settingsButton').onclick=()=>openDialog('settingsDialog');$('closeHistory').onclick=()=>closeDialog('historyDialog');$('cancelSettings').onclick=()=>closeDialog('settingsDialog');
  for(const id of ['historyDialog','settingsDialog'])$(id).addEventListener('cancel',e=>{e.preventDefault();closeDialog(id);});
  $('seconds').oninput=()=>{$('secondsValue').textContent=`${$('seconds').value} seconds`;};$('settingsForm').onsubmit=e=>{e.preventDefault();const seconds=Number($('seconds').value);if(!paceValid(seconds))return;data.settings.seconds=seconds;closeDialog('settingsDialog');if(state==='ready')ready();save();};
  document.addEventListener('keydown',e=>{if(hasDialog())return;if(e.key==='Escape'){e.preventDefault();if(state==='paused')beginCountdown();else pause();return;}if(state!=='playing'||e.target===$('answer'))return;if(/^\d$/.test(e.key)){e.preventDefault();$('answer').value=($('answer').value+e.key).slice(0,2);}if(e.key==='Backspace'){e.preventDefault();$('answer').value=$('answer').value.slice(0,-1);}if(e.key==='Enter'&&e.target.closest?.('#keypad')){e.preventDefault();submitAnswer();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();save();}});window.addEventListener('pagehide',()=>save());
}
async function init(){wire();await openStorage();ready();await save(false);requestAnimationFrame(frame);}
const initPromise=init();
// Small, validated interface for the optional cloud adapter. Local play never
// depends on downloading Firebase or reaching its servers.
window.sushiProgress={
  ready:initPromise,
  read:()=>snapshot(),
  normalize:normalizeBackup,
  pause,
  async merge(remote){
    const incoming=normalizeBackup(remote);
    const wasEmpty=!data.active&&!data.sessions.length;
    const completedHere=data.active&&incoming.sessions.some(s=>s.id===data.active.id);
    const newerDraft=data.active&&incoming.active?.id===data.active.id&&incoming.active.attempts.length>data.active.attempts.length;
    if(completedHere||newerDraft){
      data.active=completedHere?null:incoming.active;
      ready();
    }
    mergeBackup(incoming);
    if(wasEmpty)data.settings=incoming.settings;
    if(state==='ready')ready();
    if($('historyDialog').open)renderHistory();
    await save();
  }
};

