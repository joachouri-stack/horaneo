"use client";

import { useSyncExternalStore } from "react";

/**
 * Panier de la boutique, gardé dans le navigateur (le site de chaque entreprise a son
 * propre domaine, donc son propre panier). Un panier ne contient que les produits d'une
 * seule entreprise : la commande est payée sur son compte. Les prix et le stock ne sont
 * jamais pris d'ici : le serveur les relit à chaque affichage du panier et à la commande.
 */

export type CartItem = { productId: string; quantity: number };
export type Cart = { businessId: string; items: CartItem[] };

const KEY = "shop-cart";
const EVENT = "shop-cart-change";
const EMPTY: Cart | null = null;

let cached: { raw: string | null; cart: Cart | null } = { raw: null, cart: null };

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): Cart | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Cart;
    if (typeof value?.businessId !== "string" || !Array.isArray(value.items)) return null;
    const items = value.items.filter(
      (item) => typeof item?.productId === "string" && Number.isInteger(item.quantity) && item.quantity > 0,
    );
    return items.length > 0 ? { businessId: value.businessId, items } : null;
  } catch {
    return null;
  }
}

function snapshot(): Cart | null {
  const raw = readRaw();
  if (raw !== cached.raw) cached = { raw, cart: parse(raw) };
  return cached.cart;
}

function write(cart: Cart | null) {
  try {
    if (cart && cart.items.length > 0) window.localStorage.setItem(KEY, JSON.stringify(cart));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Stockage indisponible (navigation privée stricte) : le panier n'est pas gardé.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Panier actuel (null avant l'affichage dans le navigateur, ou s'il est vide). */
export function useCart(): Cart | null {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** Nombre total d'articles du panier. */
export function cartCount(cart: Cart | null): number {
  return cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
}

/** Vrai si ajouter un produit de cette entreprise viderait le panier d'une autre. */
export function conflictsWith(businessId: string): boolean {
  const cart = snapshot();
  return Boolean(cart && cart.businessId !== businessId);
}

/** Ajoute un produit (le panier d'une autre entreprise est remplacé). */
export function addToCart(businessId: string, productId: string, quantity: number, max: number) {
  const cart = snapshot();
  const items = cart && cart.businessId === businessId ? cart.items : [];
  const existing = items.some((item) => item.productId === productId);
  write({
    businessId,
    items: existing
      ? items.map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.min(item.quantity + quantity, max) }
            : item,
        )
      : [...items, { productId, quantity: Math.min(quantity, max) }],
  });
}

/** Change la quantité d'un produit (0 : le retire). */
export function setQuantity(productId: string, quantity: number) {
  const cart = snapshot();
  if (!cart) return;
  const items = cart.items
    .map((item) => (item.productId === productId ? { ...item, quantity } : item))
    .filter((item) => item.quantity > 0);
  write({ businessId: cart.businessId, items });
}

/** Retire des produits qui ne sont plus en vente. */
export function removeProducts(productIds: string[]) {
  const cart = snapshot();
  if (!cart) return;
  write({
    businessId: cart.businessId,
    items: cart.items.filter((item) => !productIds.includes(item.productId)),
  });
}

export function clearCart() {
  write(null);
}
