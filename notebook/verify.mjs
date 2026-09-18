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
let links=0;
for(const file of htmlFiles){
 const full=path.join(root,file),html=fs.readFileSync(full,'utf8');
 for(const [,href] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
  const u=new URL(href.replaceAll('&amp;','&'),'https://deepaltitude.com/'+file.replace(/index\.html$/,''));
  if(u.origin!=='https://deepaltitude.com')continue;
  const raw=path.join(root,decodeURIComponent(u.pathname));
  let target=fs.existsSync(raw)&&fs.statSync(raw).isDirectory()?path.join(raw,'index.html'):raw;
  assert.ok(fs.existsSync(target),`Broken link in ${file}: ${href}`);links++;
  if(u.hash&&target.endsWith('.html')){
   const fragment=decodeURIComponent(u.hash.slice(1));
   const ids=[...fs.readFileSync(target,'utf8').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
   assert.ok(ids.includes(fragment),`Missing fragment in ${file}: ${href}`);
  }
 }
}
console.log(`Verified ${sources.length} exact source downloads and ${links} internal links across ${htmlFiles.length} HTML pages.`);
