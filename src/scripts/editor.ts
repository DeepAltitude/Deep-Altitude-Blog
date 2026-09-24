import {marked} from '../../notebook/vendor/marked.mjs';

type Article={file:string;sha:string;title:string;description:string;body:string};
const element=<T=HTMLElement>(id:string)=>document.getElementById(id) as T;
const login=element('editor-login'),workspace=element('editor-workspace'),form=element<HTMLFormElement>('editor-form');
const choice=element<HTMLSelectElement>('editor-article'),title=element<HTMLInputElement>('editor-title'),description=element<HTMLTextAreaElement>('editor-description'),body=element<HTMLTextAreaElement>('editor-body');
const status=element('editor-status'),save=element<HTMLButtonElement>('editor-save'),preview=element('editor-preview');
const loginLink=element<HTMLAnchorElement>('login-link');
let current:Article|null=null,csrf='',busy=false,dirty=false,loadVersion=0,publishVersion=0;
const prefix='deepaltitude-original-draft:';
const draftKey=(file:string)=>prefix+file;
const values=()=>({title:title.value,description:description.value,body:body.value});
function message(text:string,error=false){status.textContent=text;status.dataset.error=String(error);}
function remember(){
  if(!current)return;
  dirty=Object.entries(values()).some(([key,value])=>value!==current![key as keyof Article]);
  save.disabled=busy||!csrf||!dirty||!title.value.trim()||!body.value.trim();
  try {
    if(dirty)sessionStorage.setItem(draftKey(current.file),JSON.stringify({...current,...values()}));
    else sessionStorage.removeItem(draftKey(current.file));
    element('editor-draft-status').textContent=dirty?'Draft kept in this tab.':'No unsaved changes.';
  }catch{element('editor-draft-status').textContent=dirty?'Unsaved changes. Keep this tab open.':'No unsaved changes.';}
}
async function api<T=Record<string,unknown>>(action:string,options:RequestInit={}):Promise<T>{
  const response=await fetch('/api/editor/'+action,{...options,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Editor-CSRF':csrf,...options.headers}});
  const data=await response.json() as T & {error?:string};
  if(!response.ok){
    const error=Object.assign(new Error(data.error||'The editor could not complete this request.'),{status:response.status});
    if(response.status===401){csrf='';save.disabled=true;login.hidden=false;loginLink.hidden=false;element('login-message').textContent='Sign in again to continue. Your draft stays in this tab.';}
    throw error;
  }
  return data;
}
function setLoginReturn(){loginLink.href='/api/editor/login?returnTo='+encodeURIComponent(location.pathname+location.search);}
function setMode(showPreview:boolean){
  if(showPreview)renderPreview();
  preview.hidden=!showPreview;body.hidden=showPreview;
  document.querySelector<HTMLElement>('.editor-toolbar')!.hidden=showPreview;
  element('editor-write').setAttribute('aria-pressed',String(!showPreview));
  element('editor-preview-toggle').setAttribute('aria-pressed',String(showPreview));
}
// Construct new DOM from a narrow allowlist; raw article HTML never enters the
// authenticated document with scripts, event handlers, styles or unsafe URLs.
function renderPreview(){
  const parsed=new DOMParser().parseFromString(marked.parse(body.value,{gfm:true,breaks:false}) as string,'text/html');
  const allowed=new Set('p h1 h2 h3 h4 h5 h6 ul ol li blockquote hr br strong em del a img pre code table thead tbody tr th td figure figcaption div span sup sub details summary'.split(' '));
  const discard=new Set(['script','style','iframe','object','embed','svg','math','template','form','input','button']);
  const clean=(node:Node):Node=>{
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent??'');
    const fragment=document.createDocumentFragment();
    if(!(node instanceof Element)||discard.has(node.localName))return fragment;
    const target=allowed.has(node.localName)?document.createElement(node.localName):fragment;
    if(target instanceof HTMLElement){
      for(const name of ['title','alt'])if(node.hasAttribute(name))target.setAttribute(name,node.getAttribute(name)!);
      const attribute=node.localName==='a'?'href':node.localName==='img'?'src':null;
      if(attribute&&node.hasAttribute(attribute)){
        try{const url=new URL(node.getAttribute(attribute)!,location.origin);if(['http:','https:'].includes(url.protocol)||(attribute==='href'&&url.protocol==='mailto:'))target.setAttribute(attribute,url.href);}catch{}
      }
      if(node.localName==='a'){target.setAttribute('target','_blank');target.setAttribute('rel','noopener noreferrer');}
      if(node.localName==='img'){target.setAttribute('loading','lazy');target.setAttribute('referrerpolicy','no-referrer');}
    }
    node.childNodes.forEach(child=>target.appendChild(clean(child)));
    return target;
  };
  preview.replaceChildren(...Array.from(parsed.body.childNodes,clean));
}
async function load(file:string,ignoreDraft=false){
  const version=++loadVersion;++publishVersion;
  form.hidden=true;current=null;dirty=false;message('');
  element('editor-conflict').hidden=true;
  if(!file){element('editor-loading').textContent='Choose an article to begin.';return;}
  element('editor-loading').textContent='Loading the latest original…';
  try{
    const article=await api<Article>('article?file='+encodeURIComponent(file));
    if(version!==loadVersion)return;
    current=article;title.value=article.title;description.value=article.description;body.value=article.body;
    let draft:Article|null=null;
    try{if(!ignoreDraft)draft=JSON.parse(sessionStorage.getItem(draftKey(file))??'null');else sessionStorage.removeItem(draftKey(file));}catch{}
    if(draft&&draft.file===file&&typeof draft.body==='string'&&typeof draft.title==='string'&&typeof draft.description==='string'){
      title.value=draft.title;description.value=draft.description;body.value=draft.body;
      if(draft.sha!==article.sha){current={...article,sha:draft.sha};element('editor-conflict').hidden=false;message('Your draft was restored, but the original has changed since you started. Review the latest version before saving.',true);}
      else message('Your unsaved draft was restored.');
    }
    const option=choice.selectedOptions[0];
    element('editor-language').textContent='ORIGINAL: '+(option.dataset.language??'');
    element<HTMLAnchorElement>('editor-view').href=option.dataset.url??'/blog/';
    element('editor-loading').textContent='';form.hidden=false;setMode(false);remember();
  }catch(error){if(version===loadVersion)element('editor-loading').textContent=(error as Error).message;}
}
choice.addEventListener('change',()=>{
  if(dirty&&!confirm('Leave this article? Your unsaved draft will remain in this tab.')){choice.value=current?.file??'';return;}
  const url=new URL(location.href);if(choice.value)url.searchParams.set('file',choice.value);else url.searchParams.delete('file');url.searchParams.delete('error');history.replaceState(null,'',url);setLoginReturn();void load(choice.value);
});
form.addEventListener('input',()=>{remember();if(!preview.hidden)renderPreview();});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
element('editor-write').addEventListener('click',()=>setMode(false));
element('editor-preview-toggle').addEventListener('click',()=>setMode(true));
document.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(button=>button.addEventListener('click',()=>{
  const start=body.selectionStart,end=body.selectionEnd,selected=body.value.slice(start,end);
  const type=button.dataset.format;
  let replacement=selected;
  if(type==='bold')replacement='**'+(selected||'text')+'**';
  if(type==='italic')replacement='*'+(selected||'text')+'*';
  if(type==='heading'||type==='quote'||type==='list'){
    const marker=type==='heading'?'## ':type==='quote'?'> ':'- ';
    replacement=(start>0&&body.value[start-1]!=='\n'?'\n':'')+(selected||'text').split('\n').map(line=>marker+line).join('\n');
  }
  if(type==='link'){
    const url=prompt('Link address (https://…)');if(!url)return;
    try{if(!['https:','http:','mailto:'].includes(new URL(url).protocol))throw Error();}catch{message('Use an https, http or email link.',true);return;}
    replacement='['+(selected||'link text')+']('+url.replaceAll(')','%29')+')';
  }
  body.focus();body.setRangeText(replacement,start,end,'select');remember();
}));
element('editor-download').addEventListener('click',()=>{
  if(!current)return;
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([title.value+'\n\n'+body.value],{type:'text/plain;charset=utf-8'}));link.download='deepaltitude-draft.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
});
element('editor-reload').addEventListener('click',()=>{
  if(busy||!current||!confirm('Replace this draft with the latest saved original? Download your draft first if you want to keep it.'))return;
  void load(current.file,true);
});
async function waitForPublication(download:string,digest:string,commit:string,version:number){
  for(let attempt=0;attempt<15;attempt++){
    await new Promise(resolve=>setTimeout(resolve,6000));
    if(version!==publishVersion)return;
    try{
      const response=await fetch(download+'?revision='+encodeURIComponent(commit),{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)continue;
      const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer()));
      const actual=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
      if(actual===digest){if(version===publishVersion)message('Published. Your original article is now live.');return;}
    }catch{}
  }
  if(version===publishVersion)message('Saved in GitHub. Publication is taking longer than usual; check the published article shortly.');
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!current||busy||!dirty)return;
  const input={...current,...values()},version=++publishVersion,download=choice.selectedOptions[0].dataset.download!;
  busy=true;save.disabled=true;choice.disabled=true;message('Saving the original…');
  // Keep the save snapshot stable while a request is in flight.
  for(const field of [title,description,body])field.readOnly=true;
  document.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(button=>button.disabled=true);
  try{
    const result=await api<{sha:string;unchanged:boolean;digest:string;commit:string}>('article',{method:'POST',body:JSON.stringify(input)});
    current={...input,sha:result.sha};element('editor-conflict').hidden=true;remember();
    message(result.unchanged?'No changes to publish.':'Saved in GitHub. Publishing your original…');
    if(!result.unchanged)void waitForPublication(download,result.digest,result.commit,version);
  }catch(error){message((error as Error).message,true);if((error as {status?:number}).status===409)element('editor-conflict').hidden=false;}
  finally{busy=false;choice.disabled=false;for(const field of [title,description,body])field.readOnly=false;document.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(button=>button.disabled=false);remember();}
});
element('editor-logout').addEventListener('click',async()=>{
  if(busy)return;
  if(dirty&&!confirm('Sign out and discard the unsaved draft in this tab? Download it first if you want to keep it.'))return;
  try{
    await api('logout',{method:'POST',body:'{}'});
    try{Object.keys(sessionStorage).filter(key=>key.startsWith(prefix)).forEach(key=>sessionStorage.removeItem(key));}catch{}
    dirty=false;current=null;csrf='';title.value='';description.value='';body.value='';preview.replaceChildren();workspace.hidden=true;login.hidden=false;loginLink.hidden=false;element('login-message').textContent='Signed out.';
  }catch(error){message((error as Error).message,true);}
});
async function init(){
  const requested=new URL(location.href).searchParams.get('file');
  if(requested&&Array.from(choice.options).some(option=>option.value===requested))choice.value=requested;
  setLoginReturn();
  try{
    const session=await api<{configured:boolean;authenticated:boolean;csrf:string;login:string}>('session');
    if(!session.configured){element('login-message').textContent='Author sign-in is not connected yet.';return;}
    if(!session.authenticated){element('login-message').textContent=new URL(location.href).searchParams.has('error')?'Sign-in did not complete. Use the DeepAltitude GitHub account and try again.':'Sign in to edit your original articles.';loginLink.hidden=false;return;}
    csrf=session.csrf;login.hidden=true;workspace.hidden=false;element('editor-account-name').textContent='Signed in as '+session.login;
    await load(choice.value);
  }catch(error){element('login-message').textContent=(error as Error).message;}
}
void init();
