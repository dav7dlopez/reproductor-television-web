import { countryPriority } from "@/lib/normalizers/prioritizeSpain";
import { normalizeText, stableCompareText } from "@/lib/normalizers/normalizeText";
import type { CategoryGroup, ChannelGroup, IPTVChannel } from "@/types/channel";

export function groupChannels(channels: IPTVChannel[]): ChannelGroup[] {
  const countries = new Map<string, Map<string, IPTVChannel[]>>();
  const countryCodes = new Map<string, string | undefined>();

  for (const channel of channels) {
    if (!countries.has(channel.country)) {
      countries.set(channel.country, new Map());
      countryCodes.set(channel.country, channel.countryCode);
    }

    const categories = countries.get(channel.country)!;
    if (!categories.has(channel.category)) {
      categories.set(channel.category, []);
    }

    categories.get(channel.category)!.push(channel);
  }

  return Array.from(countries.entries())
    .map(([country, categoriesMap]) => {
      const categories: CategoryGroup[] = Array.from(categoriesMap.entries())
        .map(([name, categoryChannels]) => ({
          name,
          normalizedName: normalizeText(name),
          channels: [...categoryChannels].sort((a, b) => {
            const byName = stableCompareText(a.name, b.name);
            return byName === 0 ? a.sourceIndex - b.sourceIndex : byName;
          }),
        }))
        .sort((a, b) => stableCompareText(a.name, b.name));

      return {
        country,
        countryCode: countryCodes.get(country),
        priority: countryPriority(country),
        categories,
        totalChannels: categories.reduce((total, category) => total + category.channels.length, 0),
      };
    })
    .sort((a, b) => {
      const byPriority = a.priority - b.priority;
      return byPriority === 0 ? stableCompareText(a.country, b.country) : byPriority;
    });
}

export function filterChannels(channels: IPTVChannel[], query: string, country?: string, category?: string): IPTVChannel[] {
  const normalizedQuery = normalizeText(query);

  return channels.filter((channel) => {
    const matchesQuery = normalizedQuery
      ? [channel.name, channel.tvgName, channel.tvgId, channel.groupTitle, channel.category, channel.country]
          .filter(Boolean)
          .some((value) => normalizeText(value).includes(normalizedQuery))
      : true;
    const matchesCountry = country ? channel.country === country : true;
    const matchesCategory = category ? channel.category === category : true;

    return matchesQuery && matchesCountry && matchesCategory;
  });
}
