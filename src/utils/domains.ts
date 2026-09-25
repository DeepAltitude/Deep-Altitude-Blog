// Shared by the static site and author editor. Taxonomy never determines file paths.
export const domains = [
  "veiksmas",
  "mokymasis",
  "protas",
  "darbas",
  "zmones",
] as const;
export type Domain = (typeof domains)[number];
export const domainNames: Record<Domain, string> = {
  veiksmas: "Veiksmas",
  mokymasis: "Mokymasis",
  protas: "Protas",
  darbas: "Darbas",
  zmones: "Žmonės",
};
export const domainDescriptions: Record<Domain, string> = {
  veiksmas: "Mokausi per kūną, riziką ir praktiką.",
  mokymasis: "Kaip įgyju įgūdžių, žinių ir kompetencijos.",
  protas: "Dėmesys, baimė ir santykis su savo mintimis.",
  darbas: "Problemos, atsakomybė ir gyvenimas organizacijose.",
  zmones: "Santykiai, bendravimas ir ribos.",
};
export const topics: Record<Domain, readonly { id: string; title: string }[]> =
  {
    veiksmas: [
      { id: "bjj", title: "BJJ" },
      { id: "freediving", title: "Freediving" },
      { id: "skydiving", title: "Skydiving" },
      { id: "paragliding", title: "Paragliding" },
      { id: "motorcycles", title: "Motorcycles" },
      { id: "gym", title: "Gym" },
    ],
    mokymasis: [
      { id: "finding-your-energy", title: "Finding your energy" },
      { id: "set-a-goal", title: "Set a goal" },
      { id: "methods", title: "Methods" },
    ],
    protas: [
      { id: "bandwidth", title: "Bandwidth" },
      { id: "meditation", title: "Meditation" },
      { id: "inner-freedom", title: "Inner freedom" },
    ],
    darbas: [
      { id: "problem-solving", title: "Problem solving" },
      { id: "leadership", title: "Leadership" },
      { id: "politics", title: "Politics" },
      { id: "negotiation", title: "Negotiation" },
    ],
    zmones: [
      { id: "fundamental-motivations", title: "Fundamental motivations" },
      { id: "negotiation", title: "Negotiation" },
      { id: "conflict-resolution", title: "Conflict resolution" },
      { id: "networking", title: "Networking" },
      { id: "boundaries", title: "Boundaries" },
    ],
  };
export function asDomain(value?: string): Domain | undefined {
  return domains.includes(value as Domain) ? (value as Domain) : undefined;
}
export const topicFor = (domain: Domain, topic?: string) =>
  topics[domain].find((item) => item.id === topic);
export const domainUrl = (domain: Domain) => `/${domain}/`;
export const topicUrl = (domain: Domain, topic: string) =>
  `/${domain}/${topic}/`;
