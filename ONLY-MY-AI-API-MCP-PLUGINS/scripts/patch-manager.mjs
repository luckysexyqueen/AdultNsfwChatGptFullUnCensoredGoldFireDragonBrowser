#!/usr/bin/env node
// User-controlled patch overlays: preview, apply, rollback. No shell commands or network access.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const action=args[0]||'help';
const flag=(name,def)=>{const i=args.indexOf(name);return i<0?def:args[i+1]};
const die=m=>{console.error(m);process.exit(1)};
const safeRelative=s=>{
 if(typeof s!=='string'||!s||s.includes('\\')||s.includes('\\0')||path.posix.isAbsolute(s)||s.split('/').some(x=>!x||x==='.'||x==='..'))die('Unsafe patch path');
 if(s.startsWith('.git/')||s.startsWith('node_modules/')||s.startsWith('runtime/')||s.startsWith('backups/')||s.startsWith('patches/')||s.startsWith('custom/')||s.startsWith('projects/'))die('Protected path: '+s);
 return s;
};
const inside=(base,rel)=>{const p=path.resolve(base,rel);if(!p.startsWith(path.resolve(base)+path.sep))die('Path escape');return p};
const noSymlink=(p,base)=>{let t=p;while(t.startsWith(base)){if(fs.existsSync(t)&&fs.lstatSync(t).isSymbolicLink())die('Symlink not allowed: '+t);if(t===base)break;t=path.dirname(t)}};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifestPath=flag('--manifest','patches/example.patch.json');
if(!manifestPath.startsWith('patches/'))die('Manifest must be in patches/');
const manifestFull=inside(root,manifestPath);
function load(){noSymlink(manifestFull,root);const m=JSON.parse(fs.readFileSync(manifestFull,'utf8'));if(!Array.isArray(m.files)||!m.files.length)die('Manifest files missing');if(!/^[a-zA-Z0-9_-]{1,64}$/.test(m.id))die('Invalid patch id');const names=new Set();for(const f of m.files){safeRelative(f.target);if(typeof f.source!=='string'||!f.source.startsWith('custom/'))die('Source must be under custom/');if(f.source.split('/').some(x=>!x||x==='..'||x==='.')||f.source.includes('\\'))die('Unsafe source');if(names.has(f.target))die('Duplicate target');names.add(f.target)}return m}
function plan(m){return m.files.map(f=>{const source=inside(root,f.source),target=inside(root,f.target);noSymlink(source,root);noSymlink(target,root);if(!fs.existsSync(source)||!fs.statSync(source).isFile())die('Missing source: '+f.source);if(fs.existsSync(target)&&!fs.statSync(target).isFile())die('Target is not a file');const next=fs.readFileSync(source),old=fs.existsSync(target)?fs.readFileSync(target):null;return {...f,source,target,targetRelative:f.target,next,old,changed:!old||!old.equals(next),before:old?sha(old):null,after:sha(next)}})}
if(action==='help'){console.log('npm run patch:preview -- --manifest patches/my.patch.json | npm run patch:apply -- --manifest ... --confirm | npm run patch:rollback -- --id patch-id --confirm');process.exit(0)}
if(action==='preview'||action==='apply'){
 const m=load(),p=plan(m);console.log(JSON.stringify({id:m.id,changes:p.map(f=>({target:f.targetRelative,status:!f.changed?'unchanged':f.old?'replace':'create',oldHash:f.before,newHash:f.after}))},null,2));
 if(action==='preview')process.exit(0);
 if(!args.includes('--confirm'))die('Apply requires --confirm after reviewing preview');
 const backup=inside(root,'backups/'+m.id);if(fs.existsSync(backup))die('Backup already exists for id; choose new id');
 fs.mkdirSync(backup,{recursive:true});const journal=[];
 try{for(const f of p){if(!f.changed)continue;const backupRel=f.targetRelative+'.bak';if(f.old){const bp=inside(backup,backupRel);fs.mkdirSync(path.dirname(bp),{recursive:true});fs.writeFileSync(bp,f.old)}journal.push({target:f.targetRelative,previousHash:f.before,appliedHash:f.after,backup:f.old?backupRel:null});}
 fs.writeFileSync(path.join(backup,'journal.json'),JSON.stringify({id:m.id,files:journal},null,2));
 for(const f of p){if(!f.changed)continue;fs.mkdirSync(path.dirname(f.target),{recursive:true});noSymlink(f.target,root);fs.writeFileSync(f.target,f.next)}
 console.log('Applied. Backup:',backup);
 }catch(e){for(const j of journal.reverse()){const target=inside(root,j.target);if(j.backup){fs.copyFileSync(inside(backup,j.backup),target)}else if(fs.existsSync(target))fs.unlinkSync(target)}die('Apply failed and reverted: '+e.message)}
}else if(action==='rollback'){
 const id=flag('--id','');if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id))die('Valid --id required');const backup=inside(root,'backups/'+id),jp=path.join(backup,'journal.json');if(!fs.existsSync(jp))die('No backup');const journal=JSON.parse(fs.readFileSync(jp));for(const j of journal.files){safeRelative(j.target);const target=inside(root,j.target);noSymlink(target,root);const current=fs.existsSync(target)?sha(fs.readFileSync(target)):null;if(current!==j.appliedHash)die('Target changed since apply: '+j.target+'; manual merge required')}
 console.log('Rollback:',journal.files.map(f=>f.target).join(', '));if(!args.includes('--confirm'))die('Rollback requires --confirm');for(const j of journal.files){const target=inside(root,j.target);if(j.backup)fs.copyFileSync(inside(backup,j.backup),target);else fs.unlinkSync(target)}fs.renameSync(jp,path.join(backup,'journal.rolled-back.json'));console.log('Rolled back')
}else die('Unknown command');
