const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {newDb}=require('pg-mem');
const {createApp,migrate}=require('../server');
const math=require('../logic');
let pool,server,origin;
before(async()=>{
  const db=newDb();const {Pool}=db.adapters.createPg();pool=new Pool();
  await migrate(pool);server=createApp(pool,{authLimit:100}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));origin=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await pool.end();});
async function api(path,{method='GET',body,cookie,headers={}}={}){
  const response=await fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json().catch(()=>null),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
}
test('accounts isolate records, survive sign-in, reject stale saves and invalidate logout',async()=>{
  assert.equal((await api('/api/workspace')).status,401);
  const a=await api('/api/auth/register',{method:'POST',body:{name:'Alice',email:'alice@example.test',password:'correct horse battery'}});
  assert.equal(a.status,201);assert.ok(a.cookie);assert.match(a.headers.get('set-cookie'),/HttpOnly/);assert.match(a.headers.get('set-cookie'),/SameSite=Lax/);
  const b=await api('/api/auth/register',{method:'POST',body:{name:'Bob',email:'bob@example.test',password:'another secure password'}});
  assert.equal(b.status,201);
  const workspace=a.data.workspace;workspace.semesters[0].courses=[{id:'course-1',code:'CSC101',title:'Computing',units:3,grade:'A'}];
  const save=await api('/api/workspace',{method:'PUT',cookie:a.cookie,body:{workspace,revision:0}});assert.equal(save.status,200);assert.equal(save.data.revision,1);
  assert.equal((await api('/api/workspace',{method:'PUT',cookie:a.cookie,body:{workspace,revision:0}})).status,409);
  assert.equal((await api('/api/workspace',{cookie:b.cookie})).data.workspace.semesters[0].courses.length,0);
  const result=await api('/api/summary',{cookie:a.cookie});assert.equal(result.data.cgpa,5);assert.equal(result.data.units,3);
  assert.equal((await api('/api/auth/login',{method:'POST',body:{email:'alice@example.test',password:'incorrect password'}})).status,401);
  const login=await api('/api/auth/login',{method:'POST',body:{email:'ALICE@example.test',password:'correct horse battery'}});assert.equal(login.status,200);
  assert.equal((await api('/api/workspace',{cookie:login.cookie})).data.workspace.semesters[0].courses.length,1);
  assert.equal((await api('/api/auth/logout',{method:'POST',cookie:login.cookie,body:{}})).status,200);
  assert.equal((await api('/api/workspace',{cookie:login.cookie})).status,401);
  const {rows}=await pool.query('SELECT password_hash FROM users WHERE email=$1',['alice@example.test']);assert.notEqual(rows[0].password_hash,'correct horse battery');
});
test('request protections and input validation',async()=>{
  const body={email:'csrf@example.test',password:'correct horse battery',name:'CSRF'};
  assert.equal((await api('/api/auth/register',{method:'POST',body,headers:{Origin:'https://other.test'}})).status,403);
  assert.equal((await api('/api/auth/register',{method:'POST',body:{...body,password:'short'}})).status,400);
  const a=await api('/api/auth/register',{method:'POST',body:{...body,email:'validation@example.test'}});
  const w=a.data.workspace;w.semesters[0].courses=[{id:'c',code:'X',title:'',units:-1,grade:'A'}];
  assert.equal((await api('/api/workspace',{method:'PUT',cookie:a.cookie,body:{workspace:w,revision:0}})).status,400);
  assert.equal((await api('/api/workspace',{method:'PUT',cookie:a.cookie,body:{workspace:{...w,scale:100},revision:0}})).status,400);
  assert.equal((await fetch(origin+'/server.js')).status,404);assert.equal((await fetch(origin+'/.env')).status,404);
  assert.equal((await api('/health')).status,200);
  await pool.query('UPDATE sessions SET expires_at=$1',[new Date(0)]);
  assert.equal((await api('/api/workspace',{cookie:a.cookie})).status,401);
});
test('weighted results, incomplete rows, blank targets and upward target rounding',()=>{
  const semesters=[{courses:[{code:'A',units:3,grade:'A'},{code:'B',units:1,grade:'C'},{code:'bad',units:2,grade:''}]},{courses:[{code:'F',units:2,grade:'F'}]}];
  assert.equal(math.calculateSemester(semesters[0],5).gpa,4.5);
  assert.equal(math.calculateOverall(semesters,5).cgpa,3);
  assert.equal(math.calculateSemester(semesters[0],4).gpa,3.5);
  assert.equal(math.planTarget({units:10,qualityPoints:32},'',3,5),null);
  const plan=math.planTarget({units:10,qualityPoints:32},3.5,3,5);assert.equal(plan.requiredDisplay,4.5);
  const rounded=math.planTarget({units:10,qualityPoints:32},3.51,3,5);assert.ok(rounded.requiredDisplay>=rounded.required);assert.equal(rounded.requiredDisplay,4.55);
  assert.equal(math.planTarget({units:100,qualityPoints:200},5,1,5).status,'impossible');
});
