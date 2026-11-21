#!/usr/bin/env python3
"""Stage the two original releases from a built publisher catalog, preserving every file byte."""
import argparse
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit
import urllib.request
import uuid

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("site", type=Path, help="Built template site containing catalog.json, packages and previews")
p.add_argument("--out", type=Path, required=True)
p.add_argument("--upload", action="store_true", help="Write the immutable parts to private Supabase Storage")
args = p.parse_args()
known = {"orchard-palette": "e5e0b2e6fd6c3a3940689e20bc2bb38ca315bc1b762fa7bb959d4721a522cc74",
         "green-hill-zone": "261245ae419eadfa26fa1ae2424b37ee1a1930da73219a6f9a512fbd34de9c49"}
catalog = json.loads((args.site / "catalog.json").read_text())
origin = "https://moader.timsfun.com/"
def ident(name): return str(uuid.uuid5(uuid.NAMESPACE_URL, origin+name))
def sql(value):
    if value is None: return "NULL"
    if isinstance(value,int): return str(value)
    return "'"+str(value).replace("'","''")+"'"
def insert(table, cols, *vals):
    statements.append(f"INSERT OR IGNORE INTO {table}({cols}) VALUES("+",".join(map(sql,vals))+");")
def local(url, folder):
    path = unquote(urlsplit(url).path).split("/"+folder+"/",1)[1]
    f = (args.site/folder/path).resolve()
    assert f.is_relative_to((args.site/folder).resolve())
    return f
def obj(aid, f, kind):
    data=f.read_bytes(); sha=hashlib.sha256(data).hexdigest(); parts=(len(data)+4194303)//4194304
    mime="application/octet-stream" if kind=="package" else "image/png" if f.suffix==".png" else "image/jpeg"
    insert("assets","id,mod_id,kind,name,mime,bytes,parts,sha,created,state",aid,mid,kind,f.name,mime,len(data),parts,sha,stamp,"ready")
    for i in range(parts):
        chunk=data[i*4194304:(i+1)*4194304]; digest=hashlib.sha256(chunk).hexdigest()
        if args.upload:
            secret=os.environ["SUPABASE_SECRET_KEY"]
            target=os.environ["SUPABASE_URL"]+"/storage/v1/object/moader-community-files/"+aid+"/"+str(i)+"-"+digest
            r=urllib.request.Request(target, data=chunk, headers={"Content-Type":"application/octet-stream","x-upsert":"true","apikey":secret,"Authorization":"Bearer "+secret})
            with urllib.request.urlopen(r,timeout=120) as res: assert res.status in (200,201)
        insert("parts","asset_id,n,sha,bytes,ready",aid,i,digest,len(chunk),1)
    return sha
statements=["-- Verified starter releases. Source and license details are in CREDITS.md."]
owner=ident("seed-creator"); insert("creators","id,handle,display_name,created",owner,"moader-catalog","Moader Catalog",0)
found=set()
for g in catalog["games"]:
    for m in g["mods"]:
        slug=m["id"]
        if slug not in known: continue
        found.add(slug); game=g["titleId"]; mid=ident("mods/"+game+"/"+slug)
        rid=ident(mid+"/"+m["version"]); pkg=ident(rid+"/package")
        stamp=int(datetime.combine(date.fromisoformat(m["published"]),datetime.min.time(),timezone.utc).timestamp())
        images=[ident(rid+"/preview/"+str(i)) for i,_ in enumerate(m["previews"])]
        meta={k:m[k] for k in ["title","category","summary","description","license","version"]}
        meta.update(game=g["title"],package=pkg,gallery=images,source=("https://gamebanana.com/mods/382728" if slug=="green-hill-zone" else ""))
        txt=json.dumps(meta,ensure_ascii=False,separators=(",",":"))
        insert("mods","id,owner,game_id,slug,draft,current_release,listed,created,updated",mid,owner,game,slug,txt,rid,1,stamp,stamp)
        package=local(m["download"]["url"],"packages")
        assert hashlib.sha256(package.read_bytes()).hexdigest()==known[slug]==m["download"]["sha256"]
        assert obj(pkg,package,"package")==known[slug]
        for aid,url in zip(images,m["previews"]): obj(aid,local(url,"previews"),"image")
        insert("releases","id,mod_id,version,meta,author,package_id,published",rid,mid,m["version"],txt,m["author"],pkg,stamp)
        for i,aid in enumerate(images): insert("gallery","release_id,asset_id,position",rid,aid,i)
        print(m["title"],package.stat().st_size,known[slug])
assert found==set(known)
args.out.write_text("\n".join(statements)+"\n")
