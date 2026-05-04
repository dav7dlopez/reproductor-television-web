export function countryPriority(country: string): number {
  return country === "España" ? 0 : country === "Otros" ? 2 : 1;
}

export function prioritizeSpain<T extends { country: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => countryPriority(a.country) - countryPriority(b.country));
}
