export type VerticalId = "book" | "food" | "gadget";

export type PriceDeal = { price: number; until: string };

export type Product = {
  id: number;
  title: string;
  author: string;
  unit?: string;
  price: number;
  old: number;
  deal?: PriceDeal;
  sold: number;
  pages?: number;
  color: string;
  cat: string;
  sub?: string;
  desc: string;
  vertical: VerticalId;
  stock: number;
  image?: string;
  image2?: string;
};

export type Pack = {
  id: number;
  title: string;
  price: number;
  old: number;
  bookIds: number[];
  desc: string;
  vertical: VerticalId;
};

export type Slide = {
  cat: string;
  kicker: string;
  title: string;
  sub: string;
  img: string;
};

export type Vertical = {
  id: VerticalId;
  name: string;
  search: string;
  kicker: string;
  title: string;
  sub: string;
  lead: string;
  popular: string;
  how1: string;
  how1p: string;
};

export type Catalog = {
  products: Product[];
  packs: Pack[];
  verticals: Vertical[];
  slides: Record<VerticalId, Slide[]>;
  ticker: string[];
};

export type CartLine = {
  kind: "book" | "pack";
  id: number;
  n: number;
};
