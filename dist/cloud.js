import { firebaseConfig } from './firebase-config.js';

const el=id=>document.getElementById(id);
const progress=window.sushiProgress;
let sdk, auth, database, user=null, ready=false, busy=false, timer=null, generation=0;
let known=new Set(), lastState='', rerun=false, localDirty=false;
const ownerKey='sushi-cloud-owner-v1';
function message(text){el('cloudStatus').textContent=text;}
function errorMessage(error){
  if(error?.code==='auth/popup-closed-by-user')return 'Sign-in was cancelled. Your progress is still saved on this device.';
  if(error?.code==='auth/popup-blocked')return 'Please allow the Google sign-in popup, then try again.';
  if(error?.code==='permission-denied')return 'Cloud access was denied. Your local progress is safe; check the Firebase rules.';
  return 'Cloud saving is unavailable right now. Local saving continues. Use Sync now when connected.';
}
function buttons(){el('cloudSignIn').hidden=!!user;el('cloudSignOut').hidden=!user;el('cloudSync').hidden=!user;}
function schedule(){
  localDirty=true;
  if(!user||!ready)return;
  if(busy){rerun=true;return;}
  if(!timer){message('Changes saved locally · cloud sync pending…');timer=setTimeout(()=>{timer=null;sync(false);},10000);}
}
window.sushiCloud={schedule};
async function download(uid,token){
  const [sessions,current]=await Promise.all([
    sdk.getDocs(sdk.collection(database,'players',uid,'sessions')),
    sdk.getDoc(sdk.doc(database,'players',uid,'state','current'))
  ]);
  if(token!==generation)return false;
  const remote=progress.normalize({version:1,sessions:sessions.docs.map(d=>d.data()),settings:current.data()?.settings,active:current.data()?.active||null});
  known=new Set(remote.sessions.map(s=>s.id));
  // A completed session must never be revived as an unfinished cloud draft.
  if(localDirty||(remote.active&&known.has(remote.active.id)))remote.active=null;
  await progress.merge(remote);
  return token===generation;
}
async function sync(pull=false){
  if(!user||!ready)return;
  if(busy){rerun=true;return;}
  clearTimeout(timer);timer=null;busy=true;rerun=false;
  const uid=user.uid,token=generation;
  try{
    message('Syncing progress…');
    if(pull&&!await download(uid,token))return;
    const local=progress.normalize(progress.read());
    for(const session of local.sessions){
      if(token!==generation)return;
      if(!known.has(session.id)){await sdk.setDoc(sdk.doc(database,'players',uid,'sessions',session.id),session);known.add(session.id);}
    }
    const state={version:1,settings:local.settings,active:local.active};
    const encoded=JSON.stringify(state);
    if(token!==generation)return;
    if(encoded!==lastState){await sdk.setDoc(sdk.doc(database,'players',uid,'state','current'),{...state,updatedAt:sdk.serverTimestamp()});lastState=encoded;}
    if(token===generation){if(!rerun)localDirty=false;message('Saved online · '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+' · '+user.email);}
  }catch(error){if(token===generation)message(errorMessage(error));}
  finally{busy=false;if(rerun)schedule();}
}
async function authenticated(account){
  const token=++generation;ready=false;user=account;known=new Set();lastState='';clearTimeout(timer);timer=null;buttons();
  if(!account){message('Sign in with a parent’s Google account to save progress online.');return;}
  await progress.ready;
  try{
    // Do not silently copy one parent's local learning records into another account.
    const previous=localStorage.getItem(ownerKey);
    if(previous&&previous!==account.uid){message('This browser’s progress belongs to another account. Sign out and use the original account, or use a separate browser profile.');return;}
    localStorage.setItem(ownerKey,account.uid);
    message('Restoring your cloud progress…');
    if(!await download(account.uid,token))return;
    ready=true;await sync(false);
  }catch(error){if(token===generation){message(errorMessage(error));el('cloudSync').hidden=false;}}
}
async function boot(){
  try{
    const modules=await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js')
    ]);
    sdk=Object.assign({},...modules);
    const app=sdk.initializeApp(firebaseConfig);auth=sdk.getAuth(app);database=sdk.getFirestore(app);
    el('cloudSignIn').disabled=false;
    el('cloudSignIn').onclick=async()=>{
      progress.pause();
      try{const provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await sdk.signInWithPopup(auth,provider);}
      catch(error){message(errorMessage(error));}
    };
    el('cloudSignOut').onclick=async()=>{progress.pause();try{await sdk.signOut(auth);message('Signed out. Progress remains on this device.');}catch(error){message(errorMessage(error));}};
    el('cloudSync').onclick=()=>{progress.pause();if(ready)sync(true);else if(auth.currentUser)authenticated(auth.currentUser);};
    sdk.onAuthStateChanged(auth,authenticated);
    window.addEventListener('online',()=>{if(ready)sync(false);else if(auth.currentUser)authenticated(auth.currentUser);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready)sync(false);});
  }catch{message('Cloud sign-in could not load. You can keep playing locally; reload when connected.');}
}
boot();

