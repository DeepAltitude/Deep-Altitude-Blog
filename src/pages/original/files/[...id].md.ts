import {getOriginals} from '../../../utils/posts';
export async function getStaticPaths(){return (await getOriginals()).map(note=>({params:{id:note.id},props:{raw:note.raw}}));}
export function GET({props}:{props:{raw:string}}){return new Response(props.raw,{headers:{'Content-Type':'text/plain; charset=utf-8'}});}
