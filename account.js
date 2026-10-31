(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  let revision=0,initial=null,latest=null,saved=null,timer=null,inFlight=null,blocked=false,user=null;
  let resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  function status(message){$('saved-status').textContent=message;}
  async function request(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options,signal:AbortSignal.timeout(20000)});
    const data=await response.json().catch(()=>({error:'The server returned an unexpected response.'}));
    if(!response.ok)throw Object.assign(new Error(data.error||'Request failed.'),{status:response.status});
    return data;
  }
  async function flush(){
    clearTimeout(timer);
    if(inFlight){await inFlight;return flush();}
    if(blocked)throw new Error('Export your unsaved changes, then reload to reconnect.');
    if(latest===null||latest===saved)return;
    const snapshot=latest;
    status('Saving to your account…');
    inFlight=request('/api/workspace',{method:'PUT',body:JSON.stringify({workspace:JSON.parse(snapshot),revision})})
      .then(data=>{revision=data.revision;saved=snapshot;status(latest===saved?'Saved to your account':'Changes waiting to save…');})
      .catch(error=>{if(error.status===401||error.status===409)blocked=true;status(`Not saved: ${error.message}`);throw error;})
      .finally(()=>{inFlight=null;});
    await inFlight;
    if(latest!==saved)return flush();
  }
  function save(workspace){
    latest=JSON.stringify(workspace);
    if(latest===saved)return;
    if(blocked)return;
    status('Changes waiting to save…');clearTimeout(timer);
    timer=setTimeout(()=>flush().catch(()=>{}),650);
  }
  async function loadAccount(account){
    const data=await request('/api/workspace');
    user=account;initial=data.workspace;revision=data.revision;saved=JSON.stringify(initial);latest=saved;
    $('auth-screen').hidden=true;document.querySelector('.app-shell').inert=false;
    status('Saved to your account');resolveReady(initial);
  }
  let mode='login';
  function setMode(next){mode=next;$('auth-name-label').hidden=mode!=='register';$('auth-name').required=mode==='register';$('auth-submit').textContent=mode==='register'?'Create account':'Sign in';$('auth-password').autocomplete=mode==='register'?'new-password':'current-password';$('login-tab').className=`button button-${mode==='login'?'gold':'secondary'}`;$('register-tab').className=`button button-${mode==='register'?'gold':'secondary'}`;$('auth-message').textContent='';}
  document.querySelector('.app-shell').inert=true;
  $('login-tab').onclick=()=>setMode('login');$('register-tab').onclick=()=>setMode('register');
  $('auth-form').onsubmit=async event=>{
    event.preventDefault();$('auth-submit').disabled=true;$('auth-message').textContent='Connecting…';
    try{
      const data=await request(`/api/auth/${mode}`,{method:'POST',body:JSON.stringify({email:$('auth-email').value,password:$('auth-password').value,name:$('auth-name').value})});
      await loadAccount(data.user);$('auth-password').value='';
    }catch(error){$('auth-message').textContent=error.name==='TimeoutError'?'The server is taking a while to respond. Please try again.':error.message;}
    finally{$('auth-submit').disabled=false;}
  };
  $('save-now').onclick=()=>flush().catch(error=>status(`Not saved: ${error.message}`));
  $('sign-out').onclick=async()=>{
    $('sign-out').disabled=true;
    try{await flush();await request('/api/auth/logout',{method:'POST',body:'{}'});location.reload();}
    catch(error){status(`Sign-out paused: ${error.message}`);$('sign-out').disabled=false;}
  };
  window.addEventListener('beforeunload',event=>{if(latest!==saved){event.preventDefault();event.returnValue='';}});
  window.addEventListener('online',()=>{if(!blocked)flush().catch(()=>{});});
  window.GradeNovaAccount={ready,save,flush,getInitial:()=>initial};
  request('/api/auth/me').then(data=>loadAccount(data.user)).catch(error=>{
    $('auth-message').textContent=error.status===401?'Sign in or create your student account.':'Unable to connect. Check your connection and try signing in again.';
  }).finally(()=>{$('auth-submit').disabled=false;});
})();
