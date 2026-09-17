(() => {
 const picker=document.querySelector('.edition-picker');
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&picker?.open){picker.open=false;picker.querySelector('summary').focus();}});
 document.addEventListener('click',event=>{if(picker?.open&&!picker.contains(event.target))picker.open=false;});
 const search=document.querySelector('#search'); if(!search)return;
 const language=document.querySelector('#language-filter'), cards=[...document.querySelectorAll('.note-card')],topics=[...document.querySelectorAll('[data-topic]')],count=document.querySelector('#result-count'),empty=document.querySelector('#empty-state'),edition=document.body.dataset.edition;
 const normalize=s=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase();
 const index=new Map(JSON.parse(document.querySelector('#search-data').textContent).map(p=>[p.id,normalize(p.text)]));
 let category='all';
 const read=()=>{const params=new URLSearchParams(location.search);search.value=params.get('q')||'';language.value=['lt','en','mixed'].includes(params.get('language'))?params.get('language'):'all';category=location.pathname.match(/\/category\/(blog|sportas|kalbos|protas)\//)?.[1]||'all';};
 function update(write=false,replace=false){
  const terms=normalize(search.value).trim().split(/\s+/).filter(Boolean);let visible=0;
  for(const card of cards){const langs=card.dataset.languages;card.hidden=!(category==='all'||category===card.dataset.category)||!(language.value==='all'||(language.value==='mixed'?langs.includes(' '):langs.split(' ').includes(language.value)))||!terms.every(term=>index.get(card.dataset.id).includes(term));if(!card.hidden)visible++;}
  topics.forEach(a=>{if(a.dataset.topic===category)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');});
  const heading=document.querySelector('#notes-title');heading.textContent=category==='all'?heading.dataset.all:{blog:'Blog',sportas:'Sportas',kalbos:'Kalbos',protas:'Protas'}[category];
  count.textContent=`${visible} / ${cards.length} ${count.dataset.label}`;empty.hidden=visible!==0;
  const suffix=category==='all'?'':`category/${category}/`, params=new URLSearchParams();
  if(search.value)params.set('q',search.value);if(language.value!=='all')params.set('language',language.value);
  const query=params.size?`?${params}`:'';
  document.querySelectorAll('[data-version]').forEach(a=>a.href=`/${a.dataset.version}/${suffix}${query}${location.hash}`);
  if(write)history[replace?'replaceState':'pushState'](null,'',`/${edition}/${suffix}${query}#notes`);
 }
 topics.forEach(a=>a.addEventListener('click',event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();category=a.dataset.topic;update(true); }));
 search.addEventListener('input',()=>update(true,true));language.addEventListener('change',()=>update(true));
 document.querySelector('.filters').addEventListener('submit',event=>{event.preventDefault();update(true);});
 document.querySelector('#reset').addEventListener('click',()=>{category='all';search.value='';language.value='all';update(true);search.focus();});
 addEventListener('popstate',()=>{read();update();});read();update();
})();
