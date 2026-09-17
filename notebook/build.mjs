import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {marked} from './vendor/marked.mjs';
import {copy, languages, htmlLang} from './i18n.mjs';
import {landscape} from './landscape.mjs';

const root=process.cwd(), out=path.join(root,'dist');
const manifest=JSON.parse(fs.readFileSync('notebook/original-manifest.json','utf8'));
const ids={1:'why-this-notebook',2:'freediving',3:'paragliding',4:'language-learning',5:'jiu-jitsu',6:'relationships',7:'health',8:'better-decisions',9:'expectations',10:'vibrations',99:'quotes'};
const categoryNames={blog:'Blog',sportas:'Sportas',kalbos:'Kalbos',protas:'Protas'};
const e=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const json=s=>JSON.stringify(s).replaceAll('<','\\u003c');
const write=(file,data)=>{fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});fs.writeFileSync(path.join(out,file),data)};
const posts=manifest.files.map(file=>{
 const bytes=fs.readFileSync(file.path), raw=bytes.toString('utf8');
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256) throw Error(`Original changed: ${file.path}. Review translations before updating the manifest.`);
 const match=raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
 if(!match) throw Error(`Missing frontmatter: ${file.path}`);
 const field=name=>{const val=match[1].match(new RegExp(`^${name}:\\s*(.*)$`,'m'))?.[1];if(!val)throw Error(`Missing ${name}`);return val.startsWith('"')?JSON.parse(val):val};
 const number=Number(path.basename(file.path).match(/^\d+/)[0]);
 return {id:ids[number],number,path:file.path,raw,body:raw.slice(match[0].length),title:field('title'),description:field('description'),date:field('pubDate').trim().replaceAll('.','-'),category:file.path.split('/')[2].toLowerCase(),sourceLang:number===99?'en':number===3||number===10?'lt en':'lt',sha256:file.sha256};
}).sort((a,b)=>b.date.localeCompare(a.date)||a.number-b.number);
const editions={original:Object.fromEntries(posts.map(p=>[p.id,p]))};
for(const lang of Object.keys(languages).filter(l=>l!=='original')){
 const txt=fs.readFileSync(`notebook/translations/${lang}.txt`,'utf8');
 const blocks=txt.split(/^@@ /m).slice(1); editions[lang]={};
 for(const block of blocks){const match=block.match(/^([^\n]+)\n# ([^\n]+)\n> ([^\n]+)\n([\s\S]*)$/);if(!match)throw Error(`Invalid translation: ${lang}`);const [,id,title,description,body]=match;if(editions[lang][id])throw Error(`Duplicate ${lang}/${id}`);editions[lang][id]={title,description,body:body.trim()};}
 if(Object.keys(editions[lang]).length!==posts.length||posts.some(p=>!editions[lang][p.id]))throw Error(`Incomplete edition: ${lang}`);
 for(const p of posts){const size=editions[lang][p.id].body.length/p.body.length;if(size<.65||size>2.3)throw Error(`Check translation length: ${lang}/${p.id} (${size})`);}
}
if(!fs.existsSync(path.join(out,'index.html'))) throw Error('Run Astro before the notebook build.');
// Preserve the previous home, including its original Lithuanian purpose text.
write('original/purpose/index.html',fs.readFileSync(path.join(out,'index.html')));
fs.cpSync('notebook/assets',path.join(out,'notebook-assets'),{recursive:true});
for(const p of posts)write(`original/files/${p.id}.md`,fs.readFileSync(p.path));
write('original/manifest.json',JSON.stringify(manifest,null,2));
const articlePath=(lang,id)=>`/${lang}/blog/${id}/`;
const homePath=(lang,cat='all')=>`/${lang}/${cat==='all'?'':`category/${cat}/`}`;
const sourceBadge=p=>p.sourceLang.toUpperCase().replace(' ',' + ');
const mark=`<svg viewBox="0 0 48 48" aria-hidden="true" fill="none"><path d="m4 33 13-22 9 14 7-11 11 19H4Z" stroke="currentColor" stroke-width="1.4"/><path d="m10 38 14-23 14 23H10Z" stroke="currentColor" stroke-width="1.4"/></svg>`;
const versionPicker=(lang,suffix)=>`<details class="edition-picker"><summary><span aria-hidden="true">◎</span> ${e(languages[lang])}<span aria-hidden="true">⌄</span></summary><div class="edition-menu">${Object.entries(languages).map(([l,name])=>`<a data-version="${l}" href="/${l}/${suffix}" lang="${htmlLang[l]}" ${l===lang?'aria-current="true"':''}>${e(name)}${l===lang?' <span aria-hidden="true">✓</span>':''}</a>`).join('')}</div></details>`;
const nav=(lang,t,suffix,category='all')=>`<a class="skip" href="#main">${e(t.skip)}</a><header class="site-header"><a class="brand" href="/${lang}/">${mark}<span>deep<span class="brand-alt">altitude</span><small>${e(t.notebook)}</small></span></a><nav aria-label="${e(t.notes)}"><a href="/${lang}/#notes" ${category==='all'?'aria-current="page"':''}>Blog</a>${['sportas','kalbos','protas'].map(cat=>`<a href="${homePath(lang,cat)}#notes" ${cat===category?'aria-current="page"':''}>${categoryNames[cat]}</a>`).join('')}<a href="/${lang}/#about">${e(t.about)}</a></nav>${versionPicker(lang,suffix)}</header>`;
const foot=(lang,t)=>`<footer><a class="footer-brand" href="/${lang}/">deepaltitude <span>↗</span></a><span>${e(t.footer)}</span><a class="source-link" href="/original/purpose/">${e(t.purpose)} · LT</a></footer>`;
const head=(lang,title,description,suffix)=>`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${e(description)}"><title>${e(title)} — Deep Altitude</title><link rel="icon" href="/notebook-assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/notebook-assets/style.css"><link rel="stylesheet" href="/notebook-assets/notebook.css"><link rel="canonical" href="https://deepaltitude.com/${lang}/${suffix}">${Object.keys(languages).map(l=>`<link rel="alternate" hreflang="${htmlLang[l]}" href="https://deepaltitude.com/${l}/${suffix}">`).join('')}<link rel="alternate" hreflang="x-default" href="https://deepaltitude.com/original/${suffix}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:type" content="${suffix.startsWith('blog/')?'article':'website'}"><meta property="og:url" content="https://deepaltitude.com/${lang}/${suffix}"><script src="/notebook-assets/app.js" defer></script>`;
function shell(lang,title,description,suffix,body,category='all'){
 const t=copy[lang];return `<!doctype html><html lang="${htmlLang[lang]}"><head>${head(lang,title,description,suffix)}</head><body data-edition="${lang}" data-category="${category}">${nav(lang,t,suffix,category)}<main id="main">${body}</main>${foot(lang,t)}</body></html>`;
}
function card(lang,p){const t=copy[lang],c=editions[lang][p.id],mins=Math.max(1,Math.round(c.body.split(/\s+/).length/200));return `<article class="note-card" data-id="${p.id}" data-category="${p.category}" data-languages="${p.sourceLang}"><a class="card-link" href="${articlePath(lang,p.id)}"><div class="card-top"><span class="category-label">${categoryNames[p.category]}</span><span class="lang-label" title="${e(t.originalLanguage)}">${sourceBadge(p)}</span></div><h3>${e(c.title)}</h3><p>${e(c.description)}</p><div class="card-bottom"><span><time datetime="${p.date}">${p.date.replaceAll('-','.')} </time><span class="dot">·</span>${mins} ${e(t.minutes)}</span><span class="card-arrow" aria-hidden="true">↗</span></div></a></article>`;}
function homepage(lang,cat='all'){
 const t=copy[lang],suffix=cat==='all'?'':`category/${cat}/`;
 const hero=cat==='all'?`<section class="hero"><div><p class="eyebrow"><span></span>${e(t.notebook)}</p><h1>${e(t.hero)}</h1><p class="hero-intro">${e(t.intro)}</p><a class="primary" href="#notes">${e(t.explore)}<span aria-hidden="true">↗</span></a><p class="hero-foot"><span>SPORTAS</span><span>KALBOS</span><span>PROTAS</span></p></div><figure class="hero-art">${landscape.replace(/aria-label="[^"]+"/,`aria-label="${e(t.landscape)}"`)}<figcaption><span>DEEP / ALTITUDE</span><span>${e(t.notebook)}</span></figcaption></figure></section>`:'';
 const cards=posts.map(p=>card(lang,p).replace('<article ',`<article ${cat!=='all'&&cat!==p.category?'hidden ':''}`)).join('');
 const body=`${hero}<section class="notebook" id="notes"><div class="section-heading"><div><p class="eyebrow">${e(languages[lang])} / ${lang==='original'?e(t.original):e(t.translation)}</p><h${cat==='all'?'2':'1'} id="notes-title" data-all="${e(t.notes)}">${cat==='all'?e(t.notes):categoryNames[cat]}</h${cat==='all'?'2':'1'}></div><p>${e(t.notesIntro)}</p></div><form class="filters" role="search"><label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="sr-only">${e(t.search)}</span><input id="search" name="q" type="search" placeholder="${e(t.search)}" autocomplete="off"></label><label class="language-filter"><span>${e(t.originalLanguage)}</span><select id="language-filter" name="language"><option value="all">${e(t.allLanguages)}</option><option value="lt">Lietuvių · LT</option><option value="en">English · EN</option><option value="mixed">LT + EN</option></select></label></form><div class="topics-row"><div class="topic-filters" aria-label="${e(t.notes)}">${['all',...Object.keys(categoryNames)].map(c=>`<a href="${homePath(lang,c)}#notes" data-topic="${c}" ${cat===c?'aria-current="true"':''}>${c==='all'?e(t.all):categoryNames[c]}</a>`).join('')}</div><span id="result-count" aria-live="polite" data-label="${e(t.results)}">${posts.filter(p=>cat==='all'||p.category===cat).length} / ${posts.length} ${e(t.results)}</span></div><div class="note-grid">${cards}</div><div id="empty-state" hidden><span aria-hidden="true">↗</span><h3>${e(t.empty)}</h3><button type="button" id="reset">${e(t.reset)}</button></div><p class="draft-note">${e(lang==='original'?t.originalNote:t.translationNote)}</p></section><section class="about" id="about"><div><p class="eyebrow">DEEP ALTITUDE</p><h2>${e(t.aboutTitle)}</h2></div><div class="about-copy"><p>${e(t.aboutText)}</p><div class="category-key">${[['sportas',t.sport],['kalbos',t.languages],['protas',t.mind]].map(([c,desc])=>`<a href="${homePath(lang,c)}#notes"><span>${categoryNames[c]}<small>${e(desc)}</small></span><span aria-hidden="true">↗</span></a>`).join('')}</div></div></section><script type="application/json" id="search-data">${json(posts.map(p=>({id:p.id,text:[editions[lang][p.id].title,editions[lang][p.id].description,editions[lang][p.id].body,p.title,p.body].join(' ')})))}</script>`;
 return shell(lang,cat==='all'?t.hero:categoryNames[cat],t.intro,suffix,body,cat);
}
for(const lang of Object.keys(languages)){
 const t=copy[lang];write(`${lang}/index.html`,homepage(lang));
 for(const cat of Object.keys(categoryNames))write(`${lang}/category/${cat}/index.html`,homepage(lang,cat));
 for(const p of posts){const c=editions[lang][p.id],original=lang==='original',bodyLang=original?(p.sourceLang==='en'?'en':'lt'):htmlLang[lang];
  const body=`<article class="article"><a class="back-link" href="/${lang}/#notes">← ${e(t.back)}</a><header class="article-header"><p class="eyebrow"><a href="${homePath(lang,p.category)}#notes">${categoryNames[p.category]}</a> / ${e(languages[lang])}</p><h1>${e(c.title)}</h1><p class="article-description">${e(c.description)}</p><div class="article-meta"><time datetime="${p.date}">${p.date.replaceAll('-','.')}</time><span>${e(t.originalLanguage)}: ${sourceBadge(p)}</span><span class="draft-badge">${e(original?t.original:t.translation)}</span></div></header><aside class="edition-note"><p>${e(original?t.originalNote:t.translationNote)}</p>${original?'':`<a href="${articlePath('original',p.id)}">${e(t.viewOriginal)} ↗</a>`}<a href="/original/files/${p.id}.md" download>${e(t.download)} ↓</a></aside><div class="article-body" lang="${bodyLang}" data-post="${p.id}">${marked.parse(c.body,{breaks:true,gfm:true})}</div>${original?`<details class="raw-source"><summary>${e(t.raw)}</summary><pre lang="${bodyLang}">${e(p.raw)}</pre></details>`:''}<nav class="article-editions" aria-label="Language">${Object.entries(languages).map(([l,name])=>`<a href="${articlePath(l,p.id)}" lang="${htmlLang[l]}" ${l===lang?'aria-current="true"':''}>${e(name)}</a>`).join('')}</nav><a class="back-link bottom-back" href="/${lang}/#notes">← ${e(t.back)}</a></article>`;
  write(`${lang}/blog/${p.id}/index.html`,shell(lang,c.title,c.description,`blog/${p.id}/`,body,p.category));
 }
}
write('index.html',homepage('original'));
write('404.html',shell('en','Page not found','The requested notebook page was not found.','',`<section class="not-found"><p class="eyebrow">404</p><h1>This page isn’t here.</h1><a class="primary" href="/original/">Open the notebook <span>↗</span></a></section>`));
const urls=Object.keys(languages).flatMap(l=>[homePath(l),...Object.keys(categoryNames).map(c=>homePath(l,c)),...posts.map(p=>articlePath(l,p.id))]);
write('notebook-sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>https://deepaltitude.com${u}</loc></url>`).join('')}</urlset>`);
const sitemap=path.join(out,'sitemap-index.xml');if(fs.existsSync(sitemap))fs.writeFileSync(sitemap,fs.readFileSync(sitemap,'utf8').replace('</sitemapindex>','<sitemap><loc>https://deepaltitude.com/notebook-sitemap.xml</loc></sitemap></sitemapindex>'));
write('robots.txt','User-agent: *\nAllow: /\nSitemap: https://deepaltitude.com/sitemap-index.xml\n');
console.log(`Notebook: ${posts.length} unchanged originals, ${posts.length*(Object.keys(languages).length-1)} translations, ${urls.length} pages.`);
