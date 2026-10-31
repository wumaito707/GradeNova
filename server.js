'use strict';
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { Pool } = require('pg');
const { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const path = require('node:path');
const math = require('./logic');
const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const hashOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const sessionMs = 7 * 24 * 60 * 60 * 1000;
const cookieName = 'gradenova_session';

async function migrate(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE TABLE IF NOT EXISTS workspaces (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL
  ); CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
}
function initialWorkspace(name) {
  return {version:1,name,institution:'',scale:5,isDemo:false,semesters:[{id:randomUUID(),name:'First semester',courses:[]}]};
}
function fail(message, status=400) { return Object.assign(new Error(message), {status}); }
function text(value,max,label,empty=true) {
  if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))throw fail(`Invalid ${label}.`);
  return value;
}
function validateWorkspace(raw) {
  if(!raw||![4,5].includes(raw.scale)||!Array.isArray(raw.semesters)||raw.semesters.length>60)throw fail('Invalid workspace. Maximum 60 semesters.');
  const ids=new Set();
  const semesters=raw.semesters.map(s=>{
    if(!s||!Array.isArray(s.courses)||s.courses.length>200)throw fail('Invalid semester. Maximum 200 courses per semester.');
    const id=text(s.id,80,'semester ID',false);if(ids.has(id))throw fail('Duplicate semester ID.');ids.add(id);
    const courseIds=new Set();
    const courses=s.courses.map(c=>{
      if(!c||!Number.isInteger(c.units)||c.units<0||c.units>30||typeof c.grade!=='string'||(c.grade!==''&&!Object.hasOwn(math.GRADE_POINTS[raw.scale],c.grade)))throw fail('Invalid course units or grade.');
      const cid=text(c.id,80,'course ID',false);if(courseIds.has(cid))throw fail('Duplicate course ID.');courseIds.add(cid);
      return {id:cid,code:text(c.code,25,'course code'),title:text(c.title,90,'course title'),units:c.units,grade:c.grade};
    });
    return {id,name:text(s.name,70,'semester name'),courses};
  });
  return {version:1,name:text(raw.name,35,'student name'),institution:text(raw.institution,90,'institution'),scale:raw.scale,isDemo:!!raw.isDemo,semesters};
}
async function hashPassword(password) {
  const salt=randomBytes(16).toString('hex');
  const hash=await derive(password,salt,64,hashOptions);
  return `${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(password,encoded) {
  const [salt,hex]=encoded.split(':');
  const actual=await derive(password,salt,64,hashOptions);
  const expected=Buffer.from(hex,'hex');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function createApp(db,{production=false,origin='',authLimit=20}={}) {
  const app=express();
  app.disable('x-powered-by');
  if(production)app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'data:'],connectSrc:["'self'"],upgradeInsecureRequests:production?[]:null}},strictTransportSecurity:production?undefined:false}));
  app.get('/health',async(req,res)=>{await db.query('SELECT 1');res.json({status:'ok'});});
  app.use('/api',(req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(!['GET','HEAD'].includes(req.method)){
      const allowed=origin||(!production?`${req.protocol}://${req.get('host')}`:'');
      if(!allowed||req.get('origin')!==allowed||req.get('sec-fetch-site')==='cross-site')return res.status(403).json({error:'This request must come from GradeNova.'});
      if(!req.is('application/json'))return res.status(415).json({error:'Send application/json.'});
    }
    next();
  });
  app.use('/api',express.json({limit:'1mb'}));
  const authLimiter=rateLimit({windowMs:15*60*1000,limit:authLimit,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many sign-in attempts. Try again in 15 minutes.'}});
  const cookieOptions={httpOnly:true,secure:production,sameSite:'lax',path:'/',maxAge:sessionMs};
  async function issueSession(res,userId){
    const token=randomBytes(32).toString('base64url');
    await db.query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)',[digest(token),userId,new Date(Date.now()+sessionMs)]);
    res.cookie(cookieName,token,cookieOptions);
  }
  function readToken(req){
    const value=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='));
    return value?value.slice(cookieName.length+1):'';
  }
  async function authenticated(req,res,next){
    const token=readToken(req);if(!token)return res.status(401).json({error:'Please sign in.'});
    const result=await db.query('SELECT users.id, users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=$1 AND expires_at>$2',[digest(token),new Date()]);
    if(!result.rows.length)return res.status(401).json({error:'Your session expired. Export unsaved changes, then sign in again.'});
    req.user=result.rows[0];req.sessionHash=digest(token);next();
  }
  function credentials(body){
    const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';
    const password=body?.password;
    if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=='string'||password.length<12||password.length>128)throw fail('Use a valid email and a password with 12–128 characters.');
    return {email,password};
  }
  app.post('/api/auth/register',authLimiter,async(req,res)=>{
    const {email,password}=credentials(req.body);const name=text(req.body.name,35,'name',false).trim();
    const id=randomUUID(),encoded=await hashPassword(password),workspace=initialWorkspace(name);
    const client=await db.connect();
    try{
      await client.query('BEGIN');
      await client.query('INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3)',[id,email,encoded]);
      await client.query('INSERT INTO workspaces (user_id,data) VALUES ($1,$2)',[id,workspace]);
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');if(e.code==='23505')throw fail('Unable to create this account. Try signing in instead.',409);throw e;}finally{client.release();}
    await issueSession(res,id);res.status(201).json({user:{id,email},workspace,revision:0});
  });
  app.post('/api/auth/login',authLimiter,async(req,res)=>{
    const {email,password}=credentials(req.body);
    const result=await db.query('SELECT id,email,password_hash FROM users WHERE email=$1',[email]);
    const user=result.rows[0];
    // Do the same expensive password calculation for unknown accounts.
    const encoded=user?.password_hash||`${'0'.repeat(32)}:${'0'.repeat(128)}`;
    if(!await verifyPassword(password,encoded)||!user)throw fail('Email or password is incorrect.',401);
    await issueSession(res,user.id);res.json({user:{id:user.id,email:user.email}});
  });
  app.post('/api/auth/logout',authenticated,async(req,res)=>{await db.query('DELETE FROM sessions WHERE token_hash=$1',[req.sessionHash]);res.clearCookie(cookieName,{httpOnly:true,secure:production,sameSite:'lax',path:'/'});res.json({ok:true});});
  app.get('/api/auth/me',authenticated,(req,res)=>res.json({user:req.user}));
  app.get('/api/workspace',authenticated,async(req,res)=>{
    const {rows}=await db.query('SELECT data,revision FROM workspaces WHERE user_id=$1',[req.user.id]);
    res.json({workspace:rows[0].data,revision:rows[0].revision});
  });
  app.put('/api/workspace',authenticated,async(req,res)=>{
    const workspace=validateWorkspace(req.body?.workspace), revision=req.body?.revision;
    if(!Number.isSafeInteger(revision)||revision<0)throw fail('Invalid workspace revision.');
    const {rows}=await db.query('UPDATE workspaces SET data=$1,revision=revision+1,updated_at=$2 WHERE user_id=$3 AND revision=$4 RETURNING revision',[workspace,new Date(),req.user.id,revision]);
    if(!rows.length)throw fail('Your records changed in another tab or device. Export these edits, then reload before restoring them.',409);
    res.json({revision:rows[0].revision});
  });
  app.get('/api/summary',authenticated,async(req,res)=>{
    const {rows}=await db.query('SELECT data FROM workspaces WHERE user_id=$1',[req.user.id]);
    const w=rows[0].data;const summary=math.calculateOverall(w.semesters,w.scale);
    res.json({...summary,classification:math.classify(summary.cgpa,w.scale)});
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'API route not found.'}));
  // Explicit allowlist: never expose backend code, environment files, or backups.
  const files={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js','/logic.js':'logic.js','/account.js':'account.js'};
  for(const [route,file] of Object.entries(files))app.get(route,(req,res)=>res.sendFile(path.join(__dirname,file)));
  app.use((req,res)=>res.status(404).send('Not found'));
  app.use((err,req,res,next)=>{
    const status=err.status||500;
    if(status>=500)console.error('Request failed:',err.code||err.name);
    res.status(status).json({error:status===413?'Request is too large.':status>=500?'The server could not complete your request. Try again.':err.type==='entity.parse.failed'?'Invalid JSON.':err.message});
  });
  return app;
}
async function start(){
  if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL before starting GradeNova.');
  const db=new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:10000});
  db.on('error',e=>console.error('Database connection error:',e.code));
  await migrate(db);
  const production=process.env.NODE_ENV==='production';
  const origin=process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL||'';
  if(production&&!origin.startsWith('https://'))throw new Error('Set an HTTPS APP_ORIGIN or RENDER_EXTERNAL_URL in production.');
  const app=createApp(db,{production,origin:origin.replace(/\/$/,'')});
  const server=app.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('GradeNova server is ready.'));
  const timer=setInterval(()=>db.query('DELETE FROM sessions WHERE expires_at<$1',[new Date()]).catch(()=>{}),3600000);timer.unref();
  async function stop(){clearInterval(timer);server.close(async()=>{await db.end();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(require.main===module)start().catch(e=>{console.error('Startup failed:',e.message);process.exitCode=1;});
module.exports={createApp,migrate,validateWorkspace};
