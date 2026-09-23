import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve('dist');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Compare downloads to CURRENT content: legitimate CMS edits and new posts must build.
const downloads=fs.readdirSync(path.join(root,'original/files')).filter(f=>f.endsWith('.md')).map(f=>digest(fs.readFileSync(path.join(root,'original/files',f))));
const sources=fs.readdirSync('src/content',{recursive:true}).filter(f=>/\.mdx?$/.test(f)&&!f.startsWith('pages/'));
assert.equal(downloads.length,sources.length);
for(const file of sources)assert.ok(downloads.includes(digest(fs.readFileSync(path.join('src/content',file)))),`Exact original download missing: ${file}`);
const htmlFiles=fs.readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.html'));
const redirects=fs.readFileSync(path.join(root,'_redirects'),'utf8').trim().split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>line.trim().split(/\s+/));
const redirectSources=new Set(redirects.map(([source])=>source));
for(const [source,target] of redirects){
 assert.ok(fs.existsSync(path.join(root,target,'index.html')),`Missing redirect destination: ${source} → ${target}`);
 const alternate=source.endsWith('/')?source.slice(0,-1):source+'/';
 assert.ok(redirectSources.has(alternate),`Missing trailing-slash variant: ${alternate}`);
}
let links=0;
for(const file of htmlFiles){
 const full=path.join(root,file),html=fs.readFileSync(full,'utf8');
 for(const [,href] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
  const u=new URL(href.replaceAll('&amp;','&'),'https://deepaltitude.com/'+file.replace(/index\.html$/,''));
  if(u.origin!=='https://deepaltitude.com')continue;
  // The author login is an on-demand API route, not a static asset.
  if(u.pathname==='/api/editor/login'){
   assert.ok(fs.existsSync('src/pages/api/editor/[action].ts'),'Missing editor API route');
   links++;continue;
  }
  const destination=redirects.find(([source])=>source===u.pathname)?.[1]??u.pathname;
  const raw=path.join(root,decodeURIComponent(destination));
  let target=fs.existsSync(raw)&&fs.statSync(raw).isDirectory()?path.join(raw,'index.html'):raw;
  assert.ok(fs.existsSync(target),`Broken link in ${file}: ${href}`);links++;
  if(u.hash&&target.endsWith('.html')){
   const fragment=decodeURIComponent(u.hash.slice(1));
   const ids=[...fs.readFileSync(target,'utf8').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
   assert.ok(ids.includes(fragment),`Missing fragment in ${file}: ${href}`);
  }
 }
}
console.log(`Verified ${sources.length} exact source downloads, ${redirects.length} redirects and ${links} internal links across ${htmlFiles.length} HTML pages.`);
