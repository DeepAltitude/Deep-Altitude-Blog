import type {Edition} from './posts';
import type {Domain} from './domains';
import {labels} from './editorial';

interface Words {
  notes: string; domains: string; principles: string; fromNote: string;
  empty: string; archive: string; darbas: string; gyvenimas: string;
}
export const knowledgeLabels: Record<Edition, Words> = {
  original: {notes:'Užrašai', domains:'Sritys', principles:'Principai', fromNote:'Iš šio užrašo', empty:'Šioje srityje užrašų dar nėra.', archive:'Patirtys ir mintys iš skirtingų gyvenimo sričių. Visi užrašai — nuo naujausio.', darbas:'Darbo praktika, bendradarbiavimas ir atsakomybė.', gyvenimas:'Kasdienybė, santykiai ir gyvenimo pasirinkimai.'},
  en: {notes:'Notes', domains:'Domains', principles:'Principles', fromNote:'From this note', empty:'No notes in this domain yet.', archive:'Experiences and reflections across life domains. All notes, newest first.', darbas:'Work, collaboration and responsibility.', gyvenimas:'Everyday life, relationships and life choices.'},
  es: {notes:'Notas', domains:'Ámbitos', principles:'Principios', fromNote:'De esta nota', empty:'Todavía no hay notas en este ámbito.', archive:'Experiencias y reflexiones de distintos ámbitos de la vida. Las notas más recientes primero.', darbas:'Trabajo, colaboración y responsabilidad.', gyvenimas:'Vida cotidiana, relaciones y decisiones vitales.'},
  pt: {notes:'Notas', domains:'Áreas', principles:'Princípios', fromNote:'Desta nota', empty:'Ainda não há notas nesta área.', archive:'Experiências e reflexões em diferentes áreas da vida. As notas mais recentes primeiro.', darbas:'Trabalho, colaboração e responsabilidade.', gyvenimas:'Quotidiano, relações e escolhas de vida.'},
  de: {notes:'Notizen', domains:'Lebensbereiche', principles:'Prinzipien', fromNote:'Aus dieser Notiz', empty:'In diesem Bereich gibt es noch keine Notizen.', archive:'Erfahrungen und Gedanken aus verschiedenen Lebensbereichen. Die neuesten Notizen zuerst.', darbas:'Arbeit, Zusammenarbeit und Verantwortung.', gyvenimas:'Alltag, Beziehungen und Lebensentscheidungen.'},
  fr: {notes:'Notes', domains:'Domaines', principles:'Principes', fromNote:'De cette note', empty:'Pas encore de notes dans ce domaine.', archive:'Expériences et réflexions dans différents domaines de la vie. Les notes les plus récentes en premier.', darbas:'Travail, collaboration et responsabilité.', gyvenimas:'Quotidien, relations et choix de vie.'},
  it: {notes:'Appunti', domains:'Ambiti', principles:'Principi', fromNote:'Da questo appunto', empty:'Non ci sono ancora appunti in questo ambito.', archive:'Esperienze e riflessioni in diversi ambiti della vita. Gli appunti più recenti per primi.', darbas:'Lavoro, collaborazione e responsabilità.', gyvenimas:'Vita quotidiana, relazioni e scelte di vita.'},
  ru: {notes:'Заметки', domains:'Сферы', principles:'Принципы', fromNote:'Из этой заметки', empty:'В этой сфере пока нет заметок.', archive:'Опыт и размышления из разных сфер жизни. Сначала новые заметки.', darbas:'Работа, сотрудничество и ответственность.', gyvenimas:'Повседневная жизнь, отношения и жизненные решения.'},
  da: {notes:'Noter', domains:'Livsområder', principles:'Principper', fromNote:'Fra denne note', empty:'Der er endnu ingen noter i dette område.', archive:'Erfaringer og tanker fra forskellige livsområder. De nyeste noter først.', darbas:'Arbejde, samarbejde og ansvar.', gyvenimas:'Hverdagsliv, relationer og livsvalg.'},
};
export function domainIntro(domain: Domain, edition: Edition) {
  if(domain === 'sportas') return labels[edition].intro.Sportas;
  if(domain === 'kalbos') return labels[edition].intro.Kalbos;
  if(domain === 'protas') return labels[edition].intro.Protas;
  return knowledgeLabels[edition][domain];
}
