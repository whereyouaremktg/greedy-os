export type SearchResultItem = {
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type GlobalSearchResults = {
  purchaseOrders: SearchResultItem[];
  vendors: SearchResultItem[];
  products: SearchResultItem[];
  runs: SearchResultItem[];
  campaigns: SearchResultItem[];
};

export const SEARCH_MIN_LENGTH = 2;
