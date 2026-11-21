import {check,MAX_ZIP} from './common.js';
export const ZIP_TAIL=2*1024*1024+65557;
const supported=name=>/^(romfs|exefs|exefs_patches)(\/|$)/.test(name)||['romfs.bin','exefs.nsp','mod.meta'].includes(name);
export function validateZip(tail,total){
 const view=new DataView(tail.buffer,tail.byteOffset,tail.byteLength),u16=i=>view.getUint16(i,true),u32=i=>view.getUint32(i,true);
 const valid=(v,msg)=>check(v,422,msg);let end=-1;
 for(let i=tail.length-22;i>=Math.max(0,tail.length-65557);i--)if(u32(i)===0x06054b50&&i+22+u16(i+20)===tail.length){end=i;break;}
 valid(end>=0,'The uploaded file is not a complete ZIP archive.');
 const count=u16(end+10),centralSize=u32(end+12),absolute=u32(end+16),start=end-centralSize;
 valid(!u16(end+4)&&!u16(end+6)&&u16(end+8)===count&&count>0&&count<=4096&&centralSize<=2*1024*1024&&start>=0&&absolute===total-tail.length+start,'Use a single standard ZIP with at most 4,096 entries.');
 let p=start,expanded=0,root=null,payload=0;const paths=[];
 for(let i=0;i<count;i++){
  valid(p+46<=end&&u32(p)===0x02014b50,'The ZIP directory is damaged.');
  const len=u16(p+28),next=p+46+len+u16(p+30)+u16(p+32),size=u32(p+24),kind=u32(p+38)>>>16 & 0xf000;
  valid(len>0&&len<=256&&next<=end,'The archive contains an invalid filename.');
  valid(!(u16(p+8)&1)&&[0,8].includes(u16(p+10))&&[0,0x4000,0x8000].includes(kind),'Use stored or deflated regular files without encryption.');
  expanded+=size;valid(size<=64*1024*1024&&expanded<=256*1024*1024&&u32(p+20)<=MAX_ZIP&&u32(p+42)+30<=absolute,'The ZIP exceeds Moader’s file limits.');
  let name=new TextDecoder().decode(tail.subarray(p+46,p+46+len));const dir=name.endsWith('/');if(dir)name=name.slice(0,-1);p=next;
  valid(name.length<=220 && !/[\\:\x00-\x1f\x7f<>"|?*\ufffd]/.test(name)&&name.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[. ]$/.test(x)),'The ZIP contains an unsupported SD path.');
  if(name==='__MACOSX'||name.startsWith('__MACOSX/')||name.split('/').at(-1)==='.DS_Store')continue;
  paths.push({name,dir});if(dir)continue;
  const slash=name.indexOf('/'),prefix=supported(name)?'':slash>=0&&supported(name.slice(slash+1))?name.slice(0,slash+1):null;
  valid(prefix!==null&&(root===null||root===prefix),'Put the mod files in romfs/, exefs/ or exefs_patches/, optionally inside one enclosing folder.');
  root=prefix;const relative=name.slice(prefix.length);if(relative!=='mod.meta')payload++;
 }
 valid(p===end&&payload,'The ZIP has no installable game files.');
 const names=new Set();for(const {name,dir} of paths){
  if(dir && name+'/'===root)continue;
  const rel=name.slice(root.length),lower=rel.toLowerCase();
  valid(name.startsWith(root)&&supported(rel)&&!names.has(lower),'The ZIP contains duplicate paths or files outside its mod folder.');
  valid(dir||!['romfs','exefs','exefs_patches'].includes(rel),'The mod root must be a directory.');
  names.add(lower);
 }
}
export function imageType(a) {
 if(a.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>a[i]===v))return 'image/png';
 if(a.length>=4&&a[0]===255&&a[1]===216&&a[2]===255&&a[a.length-2]===255&&a[a.length-1]===217)return 'image/jpeg';
 return '';
}
