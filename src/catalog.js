import {all,assetURL,body,check,field,gameOK,isoDay,isId,json,meta,modURL,now,slugOK,uid} from './common.js';
import {ownMod} from './files.js';
const liveFrom=" FROM mods m JOIN releases r ON r.id=m.current_release JOIN assets a ON a.id=r.package_id WHERE m.listed=1 AND m.deleted IS NULL";
const columns=`SELECT m.id,m.slug,m.game_id,r.id AS rid,r.version,r.meta,r.author,r.published,a.id AS aid,a.bytes,a.sha,a.name,
 (SELECT json_group_array(json_object('id',pic.id,'name',pic.name)) FROM
 (SELECT im.id,im.name FROM gallery g JOIN assets im ON im.id=g.asset_id WHERE g.release_id=r.id ORDER BY g.position) pic) AS pics`;
function present(row,origin){
 const d=JSON.parse(row.meta);
 return {id:row.id,slug:row.slug,path:new URL(modURL(origin,row)).pathname,gameId:row.game_id,game:d.game,title:d.title,author:row.author,category:d.category,summary:d.summary,description:d.description,license:d.license,source:d.source,version:row.version,published:isoDay(row.published),bytes:row.bytes,sha256:row.sha,
 download:assetURL(origin,{id:row.aid,name:row.name}),previews:JSON.parse(row.pics).map(a=>assetURL(origin,a))};
}
function whereFilters(p) {
 const clauses=[],args=[],add=(sql,v)=>{clauses.push(sql);args.push(v);};
 for(const word of (p.get('q')||'').trim().slice(0,160).toLowerCase().split(/\s+/).filter(Boolean).slice(0,8)){
  add("instr(lower(json_extract(r.meta,'$.title') || ' ' || json_extract(r.meta,'$.game') || ' ' || r.author || ' ' || json_extract(r.meta,'$.category') || ' ' || json_extract(r.meta,'$.summary')),?)>0",word);
 }
 if(p.get('game'))add('m.game_id=?',p.get('game').toUpperCase());
 if(p.get('category'))add("json_extract(r.meta,'$.category')=?",p.get('category'));
 for(const [key,op] of [['from','>='],['to','<']])if(p.get(key)){
  const date=p.get(key),n=Date.parse(date+'T00:00:00Z');check(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(n),400,'Enter a valid date.');
  add('r.published '+op+' ?',n/1000+(key==='to'?86400:0));
 }
 for(const [key,op] of [['min','>='],['max','<=']])if(p.get(key)){
  const n=Number(p.get(key));check(Number.isFinite(n)&&n>=0&&n<=100000,400,'Enter a valid size in MiB.');add('a.bytes '+op+' ?',n*1048576);
 }
 return {sql:clauses.map(s=>' AND '+s).join(''),args};
}
export async function discover(url,env){
 const p=url.searchParams,f=whereFilters(p),order={newest:'r.published DESC',oldest:'r.published ASC',name:"json_extract(r.meta,'$.title') COLLATE NOCASE ASC",'name-desc':"json_extract(r.meta,'$.title') COLLATE NOCASE DESC",largest:'a.bytes DESC',smallest:'a.bytes ASC'}[p.get('sort')||'newest'];
 check(typeof order==='string',400,'Unknown sort order.');
 const page=Number(p.get('page')||1);check(Number.isSafeInteger(page)&&page>0&&page<=100000,400,'Invalid page.');
 const [rows,count,games,cats]=await env.DB.batch([
  env.DB.prepare(columns+liveFrom+f.sql+' ORDER BY '+order+',m.id LIMIT 18 OFFSET ?').bind(...f.args,(page-1)*18),
  env.DB.prepare('SELECT count(*) AS n'+liveFrom+f.sql).bind(...f.args),
  env.DB.prepare("SELECT m.game_id AS id,min(json_extract(r.meta,'$.game')) AS name"+liveFrom+' GROUP BY m.game_id ORDER BY name COLLATE NOCASE'),
  env.DB.prepare("SELECT DISTINCT json_extract(r.meta,'$.category') AS name"+liveFrom+' ORDER BY name COLLATE NOCASE')
 ]);
 return json({items:rows.results.map(r=>present(r,env.PUBLIC_ORIGIN)),total:count.results[0].n,page,pageSize:18,games:games.results,categories:cats.results.map(x=>x.name)});
}
export async function details(env,game,slug,version){
 check(gameOK(game)&&slugOK(slug),404,'Mod not found.');
 const from=version?" FROM mods m JOIN releases r ON r.mod_id=m.id JOIN assets a ON a.id=r.package_id WHERE m.listed=1 AND m.deleted IS NULL AND r.version=?":liveFrom;
 const row=await env.DB.prepare(columns+from+' AND m.game_id=? AND m.slug=?').bind(...(version?[version]:[]),game.toUpperCase(),slug).first();check(row,404,'This mod is unavailable.');
 const versions=await all(env.DB.prepare('SELECT version,published FROM releases WHERE mod_id=? ORDER BY published DESC,id DESC').bind(row.id));
 return json({...present(row,env.PUBLIC_ORIGIN),versions:versions.map(v=>({version:v.version,published:isoDay(v.published)}))});
}
export async function feed(url,env){
 const after=url.searchParams.get('after')||'';check(!after||isId(after),400,'Invalid catalog cursor.');
 const rows=await all(env.DB.prepare(columns+liveFrom+' AND m.id>? ORDER BY m.id LIMIT 41').bind(after));
 const page=rows.slice(0,40),games=new Map();
 for(const row of page){const d=present(row,env.PUBLIC_ORIGIN);let g=games.get(d.gameId);if(!g){g={titleId:d.gameId,title:d.game,mods:[]};games.set(d.gameId,g);}
  g.mods.push({id:d.slug,title:d.title,author:d.author,category:d.category,summary:d.summary,description:d.description,version:d.version,published:d.published,license:d.license,previews:d.previews,sources:[{label:'Moader Catalog',url:env.PUBLIC_ORIGIN+d.path},...(d.source?[{label:'Creator source',url:d.source}]:[])],download:{url:d.download,bytes:d.bytes,sha256:d.sha256}});
 }
 return json({format:'moader.catalog.v1',name:'Moader Catalog',games:[...games.values()],...(rows.length>40?{next:env.PUBLIC_ORIGIN+'/catalog.json?after='+page.at(-1).id}:{})},200,{'Cache-Control':'public, max-age=0, must-revalidate'});
}
function revision(v){check(Number.isSafeInteger(v)&&v>0,400,'Reload the draft before saving.');return v;}
const summary=m=>({id:m.id,gameId:m.game_id,slug:m.slug,listed:!!m.listed,revision:m.revision,updated:m.updated,hasRelease:!!m.current_release,draft:JSON.parse(m.draft)});
export async function studioList(env,u){return json({mods:(await all(env.DB.prepare('SELECT * FROM mods WHERE owner=? AND deleted IS NULL ORDER BY updated DESC').bind(u.id))).map(summary)});}
export async function studioDetail(env,u,id){
 const m=await ownMod(env,u,id);
 const assets=await all(env.DB.prepare("SELECT id,name,mime,kind,bytes,sha FROM assets WHERE mod_id=? AND state='ready' ORDER BY created DESC").bind(id));
 const versions=await all(env.DB.prepare('SELECT version,published FROM releases WHERE mod_id=? ORDER BY published DESC').bind(id));
 return json({...summary(m),assets:assets.map(a=>({...a,url:assetURL(env.PUBLIC_ORIGIN,a)})),versions});
}
export async function createMod(req,env,u){
 const input=await body(req),d=meta(input),slug=input.slug,game=String(input.gameId||'').toUpperCase();
 check(gameOK(game)&&slugOK(slug),400,'Enter a 16-character game Title ID and a lowercase mod ID.');
 const id=uid(),t=now();
 try{const result=await env.DB.prepare('INSERT INTO mods(id,owner,game_id,slug,draft,created,updated) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM mods WHERE owner=? AND deleted IS NULL)<100').bind(id,u.id,game,slug,JSON.stringify(d),t,t,u.id).run();check(result.meta.changes===1,409,'Your studio has reached its 100-mod limit.');}
 catch(e){if(String(e).includes('UNIQUE'))check(false,409,'That mod ID is already in use for this game.');throw e;}
 return studioDetail(env,u,id);
}
async function checkAssets(env,id,d,forPublish=false){
 const refs=[...(d.package?[d.package]:[]),...d.gallery];if(!refs.length)return;
 const valid=await all(env.DB.prepare("SELECT id,kind,sha FROM assets WHERE mod_id=? AND state='ready' AND id IN ("+refs.map(()=>'?').join(',')+')').bind(id,...refs));
 check(refs.every(ref=>valid.find(a=>a.id===ref&&a.kind===(ref===d.package?'package':'image'))),400,'Choose completed files belonging to this mod.');
}
export async function changeMod(req,env,u,id,action){
 const m=await ownMod(env,u,id),input=await body(req),rev=revision(input.revision);
 check(m.revision===rev,409,'This draft changed. Reopen it before saving.');
 if(action==='save'){
  const d=meta(input.draft);await checkAssets(env,id,d);
  const r=await env.DB.prepare('UPDATE mods SET draft=?,updated=?,revision=revision+1 WHERE id=? AND revision=? AND deleted IS NULL').bind(JSON.stringify(d),now(),id,rev).run();
  check(r.meta.changes===1,409,'The draft changed. Reload and try again.');
 }else if(action==='unpublish'||action==='delete'){
  const sql=action==='delete'?'deleted=?, listed=0':'updated=?, listed=0';
  const r=await env.DB.prepare('UPDATE mods SET '+sql+',revision=revision+1 WHERE id=? AND revision=? AND deleted IS NULL').bind(now(),id,rev).run();
  check(r.meta.changes===1,409,'The draft changed. Reload and try again.');if(action==='delete')return json({ok:true});
 }else if(action==='publish'){
  const d=meta(JSON.parse(m.draft));check(d.package&&d.version&&d.license&&d.summary&&d.description,400,'Add a ZIP, version, license, summary and description before publishing.');
  await checkAssets(env,id,d,true);
  const old=await env.DB.prepare('SELECT r.id,r.package_id,a.sha FROM releases r JOIN assets a ON a.id=r.package_id WHERE r.mod_id=? AND r.version=?').bind(id,d.version).first();
  const pkg=await env.DB.prepare('SELECT sha FROM assets WHERE id=? AND mod_id=?').bind(d.package,id).first();
  check(!old||old.sha===pkg.sha,409,'Use a new version number when replacing a published ZIP.');
  const rid=old?.id||uid(),t=now(),db=env.DB;
  const statements=[db.prepare('UPDATE mods SET revision=CASE WHEN revision=? AND deleted IS NULL THEN revision+1 ELSE NULL END,current_release=?,listed=1,updated=? WHERE id=?').bind(rev,rid,t,id),
   db.prepare('INSERT INTO releases(id,mod_id,version,meta,author,package_id,published) VALUES(?,?,?,?,?,?,?) ON CONFLICT(mod_id,version) DO UPDATE SET meta=excluded.meta, author=excluded.author').bind(rid,id,d.version,JSON.stringify(d),u.display_name,old?.package_id||d.package,t),
   db.prepare('DELETE FROM gallery WHERE release_id=?').bind(rid),
   ...d.gallery.map((a,i)=>db.prepare('INSERT INTO gallery(release_id,asset_id,position) VALUES(?,?,?)').bind(rid,a,i))];
  try{await db.batch(statements);}catch(e){if(String(e).includes('mods.revision'))check(false,409,'The draft changed. Reload and try again.');throw e;}
 }else check(false,404,'Studio action not found.');
 return studioDetail(env,u,id);
}
export async function removeAsset(env,u,id){
 const a=await env.DB.prepare('SELECT a.mod_id,m.draft FROM assets a JOIN mods m ON m.id=a.mod_id WHERE a.id=? AND m.owner=? AND m.deleted IS NULL').bind(id,u.id).first();check(a,404,'File not found.');
 const result=await env.DB.prepare(`UPDATE assets SET state='garbage' WHERE id=? AND NOT EXISTS(SELECT 1 FROM releases WHERE package_id=?) AND NOT EXISTS(SELECT 1 FROM gallery WHERE asset_id=?) AND NOT EXISTS(SELECT 1 FROM mods m WHERE m.id=assets.mod_id AND (json_extract(m.draft,'$.package')=? OR EXISTS(SELECT 1 FROM json_each(m.draft,'$.gallery') WHERE value=?)))`).bind(id,id,id,id,id).run();check(result.meta.changes===1,409,'Remove the file from your draft first. Published versions retain their files.');return json({ok:true});
}
