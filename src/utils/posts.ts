import {getCollection, type CollectionEntry} from 'astro:content';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {languages, htmlLang, copy} from '../../notebook/i18n.mjs';
import manifest from '../../notebook/original-manifest.json';
import {asDomain, resolveDomain, type Domain} from './domains';

export {languages, htmlLang, copy};
export type Edition = keyof typeof languages;
export const editions = Object.keys(languages) as Edition[];
export const categories = ['Sportas','Kalbos','Protas','Blog'] as const;
export type Category = typeof categories[number];
type Source = CollectionEntry<'blog'|'Sportas'|'Kalbos'|'Protas'|'notes'>;
const aliases:Record<string,string> = {
 'blog/01-apie-ka':'why-this-notebook','Sportas/02-freediving':'freediving',
 'Sportas/03-parapente':'paragliding','Kalbos/04-kalbu-mokymasis':'language-learning',
 'Sportas/05-jiu-jitsu':'jiu-jitsu','Protas/06-santykiai':'relationships',
 'Sportas/07-sveikata':'health','Protas/08-sprendimai':'better-decisions',
 'Protas/09-nesitikek-ko-negali-duoti':'expectations','Protas/10-vibracijos':'vibrations','Protas/99-quotes':'quotes',
};
export interface Note {
 source:Source; id:string; url:string; category:Category; language:string; originalLanguage:string;
 domain?:Domain; principles:string[]; tags:string[];
 title:string; description:string; pubDate:Date; updatedDate?:Date;
 heroImage?:string; heroImageAlt?:string; heroCaption?:string;
 body:string; raw:string; edition:Edition; translated:boolean; stale:boolean; example:boolean;
}
let originals:Promise<Note[]> | undefined;
export function getOriginals(){
 return originals ??= (async()=>{
  const collections=await Promise.all([getCollection('blog'),getCollection('Sportas'),getCollection('Kalbos'),getCollection('Protas'),getCollection('notes')]);
  const notes=collections.flat().map(source=>{
   const key=`${source.collection}/${source.id}`, id=aliases[key]||`${source.collection}-${source.id}`;
   const language=source.data.language||(id==='quotes'?'en':['paragliding','vibrations'].includes(id)?'mul':'lt');
   const raw=fs.readFileSync(source.filePath!,'utf8');
   const baseline=manifest.files.find(f=>f.path===source.filePath?.replace(/^\.\//,''));
   return {
    ...source.data, source,id,url:`/blog/${source.id}/`,
    category:source.data.category||(categories.includes(source.collection as Category)?source.collection as Category:'Blog'),
    domain:resolveDomain(source.data.domain,source.data.category,source.collection),
    language,originalLanguage:source.data.originalLanguage||language,
    body:source.body??'',raw,edition:'original' as Edition,translated:false,
    stale:!!baseline&&crypto.createHash('sha256').update(raw).digest('hex')!==baseline.sha256,
    example:source.id==='markdown-style-guide',
   } as Note;
  }).sort((a,b)=>b.pubDate.valueOf()-a.pubDate.valueOf()||a.source.id.localeCompare(b.source.id));
  if(new Set(notes.map(n=>n.id)).size!==notes.length)throw Error('Duplicate note identifiers');
  if(new Set(notes.map(n=>n.url)).size!==notes.length)throw Error('Duplicate article URLs: article filenames must be unique across collections');
  return notes;
 })();
}
interface Translation {title:string;description:string;body:string}
const translations = new Map<Edition, Record<string,Translation>>();
function translationFile(edition:Edition){
 if(!translations.has(edition)){
  const entries:Record<string,Translation>={};
  for(const block of fs.readFileSync(`notebook/translations/${edition}.txt`,'utf8').split(/^@@ /m).slice(1)){
   const match=block.match(/^([^\n]+)\n# ([^\n]+)\n> ([^\n]+)\n([\s\S]*)$/);
   if(!match)throw Error(`Malformed translation file: ${edition}`);
   const [,id,title,description,body]=match;entries[id]={title,description,body:body.trim()};
  }
  translations.set(edition,entries);
 }
 return translations.get(edition)!;
}
export async function getNotes(edition:Edition='original',includeExamples=false):Promise<Note[]>{
 const all=(await getOriginals()).filter(n=>includeExamples||!n.example);
 if(edition==='original')return all;
 const text=translationFile(edition);
 return all.flatMap(n=>text[n.id]?[{...n,...text[n.id],url:`/${edition}/blog/${n.id}/`,language:htmlLang[edition],edition,translated:true}]:n.language===edition?[{...n,url:`/${edition}/blog/${n.id}/`,edition}]:[]);
}
export const getAllPosts=()=>getNotes();
export const homeUrl=(edition:Edition='original')=>edition==='original'?'/':`/${edition}/`;
export const domainUrl=(domain:Domain,edition:Edition='original')=>edition==='original'?`/${domain}/`:`/${edition}/category/${domain}/`;
export const indexUrl=(edition:Edition='original',category?:Category|Domain)=>{
 const domain=asDomain(category);
 if(domain)return domainUrl(domain,edition);
 return category==='Blog'?`/${edition}/category/blog/`:edition==='original'?'/blog/':`/${edition}/notes/`;
};
export const aboutUrl=(edition:Edition='original')=>edition==='original'?'/about/':'/en/about/';
export const dateLabel=(date:Date)=>date.toISOString().slice(0,10).replaceAll('-','.');
export const langLabel=(code:string)=>code==='mul'?'LT + EN':code.toUpperCase();
export const bodyLanguage=(note:Note)=>note.language==='mul'?'lt':note.language;
export function usableImage(image?:string){return image&&!image.includes('blog-placeholder')?image:undefined;}
export async function versionsFor(note:Note){
 const links=[];
 for(const edition of editions){const found=(await getNotes(edition)).find(n=>n.id===note.id);if(found)links.push({edition,href:found.url});}
 return links;
}
