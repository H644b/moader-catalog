import {createClient} from '@supabase/supabase-js';
import {all,body,check,field,hash,json,now,random,uid} from './common.js';
const cookie='__Host-mo_session';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const provider=(env,admin=false)=>createClient(env.SUPABASE_URL,admin?env.SUPABASE_SECRET_KEY:env.SUPABASE_PUBLIC_KEY,options);
const safeUser=u=>({handle:u.handle,displayName:u.display_name});
function cookieHeader(value,maxAge){return {'Set-Cookie':cookie+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+maxAge};}
function validHandle(value){const h=String(value||'').trim().toLowerCase();check(/^[a-z0-9][a-z0-9_-]{2,27}$/.test(h),400,'Use 3–28 letters, digits, hyphens or underscores for your username.');return h;}
function password(v){check(typeof v==='string' && v.length>=10 && new TextEncoder().encode(v).length<=72,400,'Use a password of at least 10 characters and at most 72 bytes.');return v;}
const recovery=()=>random(20).match(/.{1,8}/g).join('-');
const recoveryHash=(id,key)=>hash(id+'|'+String(key||'').trim().replaceAll('-','').toLowerCase());
export async function limit(req,env,label,max,seconds){
 const stamp=now(),slot=Math.floor(stamp/seconds),ip=req.headers.get('cf-connecting-ip')||'local';
 const key=await hash(label+'|'+slot+'|'+ip);
 const row=await env.DB.prepare('INSERT INTO limits(key,hits,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(key,(slot+1)*seconds).first();
 check(row.hits<=max,429,'Too many attempts. Please try again later.');
}
async function sessionKey(req){const raw=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookie+'='))?.slice(cookie.length+1);return /^[0-9a-f]{64}$/.test(raw||'')?hash(raw):null;}
export async function viewer(req,env,required=true){
 const digest=await sessionKey(req);const user=digest?await env.DB.prepare('SELECT c.id,c.handle,c.display_name,c.auth_email FROM sessions s JOIN creators c ON c.id=s.owner WHERE s.digest=? AND s.expires>?').bind(digest,now()).first():null;
 if(required)check(user,401,'Sign in to continue.');return user;
}
async function signSession(env,u,extra={}) {
 const token=random(),expires=14*86400;
 await env.DB.prepare('INSERT INTO sessions(digest,owner,expires) VALUES(?,?,?)').bind(await hash(token),u.id,now()+expires).run();
 return json({user:safeUser(u),...extra},200,cookieHeader(token,expires));
}
async function verify(env,u,pass){
 if(!u?.auth_email)return false;
 const client=provider(env);
 const {data,error}=await client.auth.signInWithPassword({email:u.auth_email,password:pass});
 if(error || data.user?.id!==u.id)return false;
 await client.auth.signOut({scope:'local'});return true;
}
export async function accounts(req,env,path){
 if(path==='session'&&req.method==='GET'){const u=await viewer(req,env,false);return json({user:u?safeUser(u):null});}
 check(req.method==='POST',405,'Unsupported method.');
 const input=await body(req);
 if(path==='logout'){const digest=await sessionKey(req);if(digest)await env.DB.prepare('DELETE FROM sessions WHERE digest=?').bind(digest).run();return json({ok:true},200,cookieHeader('',0));}
 if(path==='profile'){
  const u=await viewer(req,env);const display=field(input.displayName,'display name',70);
  await env.DB.prepare('UPDATE creators SET display_name=? WHERE id=?').bind(display,u.id).run();
  return json({user:{handle:u.handle,displayName:display}});
 }
 if(path==='change-password'||path==='recovery-key'){
  const u=await viewer(req,env);await limit(req,env,'sensitive',15,900);
  check(await verify(env,u,password(input.password)),403,'The current password is incorrect.');
  if(path==='recovery-key'){const key=recovery();await env.DB.prepare('UPDATE creators SET recovery_hash=? WHERE id=?').bind(await recoveryHash(u.id,key),u.id).run();return json({recoveryKey:key});}
  const {error}=await provider(env,true).auth.admin.updateUserById(u.id,{password:password(input.newPassword)});check(!error,400,'The new password was not accepted.');
  await env.DB.prepare('DELETE FROM sessions WHERE owner=?').bind(u.id).run();return signSession(env,u);
 }
 check(['signup','login','recover'].includes(path),404,'Account action not found.');
 const handle=validHandle(input.handle),pass=password(input.password);
 await limit(req,env,path,path==='signup'?8:30,900);
 const u=await env.DB.prepare('SELECT * FROM creators WHERE handle=?').bind(handle).first();
 if(path==='login'){check(await verify(env,u,pass),401,'The username or password is incorrect.');return signSession(env,u);}
 if(path==='recover'){
  const old=await recoveryHash(u?.id||'-',input.recoveryKey);
  check(u?.auth_email && old===u.recovery_hash,403,'The username or recovery key is incorrect.');
  const next=recovery(),nextHash=await recoveryHash(u.id,next);
  const claim=await env.DB.prepare('UPDATE creators SET recovery_hash=? WHERE id=? AND recovery_hash=?').bind(nextHash,u.id,old).run();check(claim.meta.changes===1,409,'This recovery key was already used.');
  const {error}=await provider(env,true).auth.admin.updateUserById(u.id,{password:pass});
  if(error){await env.DB.prepare('UPDATE creators SET recovery_hash=? WHERE id=? AND recovery_hash=?').bind(old,u.id,nextHash).run();check(false,400,'Could not update your password.');}
  await env.DB.prepare('DELETE FROM sessions WHERE owner=?').bind(u.id).run();return signSession(env,u,{recoveryKey:next});
 }
 check(!u && !['admin','support','moader','catalog','moader-team'].includes(handle),409,'That username is already in use.');
 const display=field(input.displayName||handle,'display name',70),email='creator-'+uid()+'@accounts.moader.invalid';
 const admin=provider(env,true).auth.admin;
 const {data,error}=await admin.createUser({email,password:pass,email_confirm:true});
 check(!error && data.user,503,'Account creation is temporarily unavailable.');
 const user={id:data.user.id,handle,display_name:display},key=recovery();
 try{await env.DB.prepare('INSERT INTO creators(id,handle,display_name,auth_email,recovery_hash,created) VALUES(?,?,?,?,?,?)').bind(user.id,handle,display,email,await recoveryHash(user.id,key),now()).run();}
 catch(e){await admin.deleteUser(user.id);if(String(e).includes('UNIQUE'))check(false,409,'That username is already in use.');throw e;}
 return signSession(env,user,{recoveryKey:key});
}
