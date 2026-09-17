import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve('dist');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(fs.readFileSync('notebook/original-manifest.json','utf8'));
const downloads=fs.readdirSync(path.join(root,'original/files')).filter(f=>f.endsWith('.md')).map(f=>digest(fs.readFileSync(path.join(root,'original/files',f))));
assert.equal(downloads.length,manifest.files.length);
for(const file of manifest.files){assert.equal(digest(fs.readFileSync(file.path)),file.sha256,`Original changed: ${file.path}`);assert.ok(downloads.includes(file.sha256),`Original download missing: ${file.path}`);}
const htmlFiles=fs.readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.html'));
let links=0;
for(const file of htmlFiles){
 const full=path.join(root,file),html=fs.readFileSync(full,'utf8');
 for(const [,href] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
  const u=new URL(href.replaceAll('&amp;','&'),'https://deepaltitude.com/'+file.replace(/index\.html$/,''));
  if(u.origin!=='https://deepaltitude.com')continue;
  const raw=path.join(root,decodeURIComponent(u.pathname));
  let target=fs.existsSync(raw)&&fs.statSync(raw).isDirectory()?path.join(raw,'index.html'):raw;
  assert.ok(fs.existsSync(target),`Broken link in ${file}: ${href}`);links++;
 }
}
console.log(`Verified ${manifest.files.length} exact original downloads and ${links} internal links across ${htmlFiles.length} HTML pages.`);
