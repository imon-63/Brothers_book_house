"use client";

import { useMemo } from "react";
import { useAppSelector } from "@/store/hooks";
import type { VerticalId } from "./types";

export function useProducts(vertical: VerticalId) {
  const products = useAppSelector((s) => s.shop.products);
  const data = useMemo(
    () => products.filter((p) => p.vertical === vertical).sort((a, b) => b.sold - a.sold),
    [products, vertical],
  );
  return { data };
}

export function useProduct(id: number) {
  const products = useAppSelector((s) => s.shop.products);
  return { data: products.find((p) => p.id === id) ?? null };
}
