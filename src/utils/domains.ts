export const domains = ['sportas', 'kalbos', 'protas', 'darbas', 'gyvenimas'] as const;
export type Domain = typeof domains[number];
export const domainNames: Record<Domain, string> = {
  sportas: 'Sportas', kalbos: 'Kalbos', protas: 'Protas', darbas: 'Darbas', gyvenimas: 'Gyvenimas',
};
export function asDomain(value?: string): Domain | undefined {
  const key = value?.trim().toLowerCase();
  return domains.includes(key as Domain) ? key as Domain : undefined;
}
export function resolveDomain(domain?: Domain, category?: string, collection?: string): Domain | undefined {
  // Explicit metadata wins. Old categories/folders are evidence, not guesses from prose.
  return domain ?? asDomain(category ?? collection);
}
