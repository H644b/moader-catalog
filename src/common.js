export const CHUNK = 4 * 1024 * 1024, MAX_ZIP = 128 * 1024 * 1024, MAX_IMAGE = 2 * 1024 * 1024;
export const now = () => Math.floor(Date.now()/1000);
export class Problem extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function check(condition, status, msg) { if (!condition) throw new Problem(status,msg); }
export function json(value, status=200, extra={}) {
  return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});
}
export const hex = bytes => Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,'0')).join('');
export const hash = async value => hex(await crypto.subtle.digest('SHA-256',typeof value === 'string' ? new TextEncoder().encode(value) : value));
export const random = (n=32) => hex(crypto.getRandomValues(new Uint8Array(n)));
export const uid = () => crypto.randomUUID();
export const all = async (stmt) => (await stmt.all()).results;
export function field(value, name, max, optional=false) {
  const s=typeof value==='string'?value.trim():'';
  check((optional||s.length>0) && new TextEncoder().encode(s).length<=max && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s),400,'Check the '+name+' field (maximum '+max+' bytes).');
  return s;
}
export async function bytes(request, limit) {
  check(Number(request.headers.get('Content-Length')||0)<=limit,413,'This file is too large.');
  const reader=request.body?.getReader(); check(reader,400,'Request body is missing.');
  const chunks=[]; let n=0;
  for (;;) {const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>limit){await reader.cancel();throw new Problem(413,'This file is too large.');}chunks.push(value);}
  const out=new Uint8Array(n);let off=0;for(const c of chunks){out.set(c,off);off+=c.length;}return out;
}
export async function body(request) {
  check(request.headers.get('content-type')?.split(';')[0]==='application/json',415,'Send JSON for this request.');
  try {const value=JSON.parse(new TextDecoder().decode(await bytes(request,32768)));check(value && typeof value==='object' && !Array.isArray(value),400,'Invalid form.');return value;}
  catch(e){if(e instanceof Problem)throw e;throw new Problem(400,'Invalid JSON.');}
}
export function meta(input) {
  const value={};
  for (const [k,max,optional] of [['title',120],['game',160],['category',40],['summary',380,true],['description',4000,true],['license',96,true],['version',48,true],['source',650,true]]) value[k]=field(input[k],k,max,optional);
  check(!value.version || /^[A-Za-z0-9._+-]+$/.test(value.version),400,'Use a version such as 1.0.0.');
  if(value.source){let u;try{u=new URL(value.source);}catch{}check(u && u.protocol==='https:' && !u.username && !u.password,400,'Enter a public HTTPS source link.');}
  value.package=input.package || null;value.gallery=input.gallery??[];
  check(!value.package||isId(value.package),400,'Invalid package selection.');
  check(Array.isArray(value.gallery)&&value.gallery.length<=8&&value.gallery.every(isId)&&new Set(value.gallery).size===value.gallery.length,400,'Choose up to eight different previews.');
  return value;
}
export const isId = s => typeof s==='string' && /^[a-f0-9-]{36}$/.test(s);
export const isoDay = stamp => new Date(stamp*1000).toISOString().slice(0,10);
export function safeFile(name){return name.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,100)||'mod.zip';}
export const assetURL=(origin,a)=>origin+'/files/'+a.id+'/'+encodeURIComponent(safeFile(a.name));
export const modURL=(origin,m)=>origin+'/mods/'+m.game_id+'/'+m.slug;
export const slugOK=s=>typeof s==='string' && /^[a-z0-9_-]{1,48}$/.test(s);
export const gameOK=s=>typeof s==='string' && /^(01|04)[0-9a-f]{14}$/i.test(s);
