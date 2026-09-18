import rss from '@astrojs/rss';
import {getNotes} from '../utils/posts';
import {SITE_TITLE,SITE_DESCRIPTION} from '../consts';
export async function GET(context){
 const notes=await getNotes();
 return rss({title:SITE_TITLE,description:SITE_DESCRIPTION,site:context.site,items:notes.map(note=>({title:note.title,description:note.description,pubDate:note.pubDate,link:note.url})),customData:'<language>lt</language>'});
}
