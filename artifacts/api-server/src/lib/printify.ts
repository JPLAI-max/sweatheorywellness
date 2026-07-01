const BASE_URL = "https://api.printify.com/v1";

function getApiKey(): string {
  const key = process.env.PRINTIFY_API_KEY;
  if (!key) throw new Error("PRINTIFY_API_KEY environment variable is not set");
  return key;
}

async function printifyFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Printify API ${res.status} on ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

let _cachedShopId: string | null = null;

export async function getOrCreateShop(): Promise<string> {
  if (_cachedShopId) return _cachedShopId;

  const shops = await printifyFetch<any[]>("/shops.json");
  if (Array.isArray(shops) && shops.length > 0) {
    _cachedShopId = String(shops[0].id);
    return _cachedShopId;
  }

  const shop = await printifyFetch<any>("/shops.json", {
    method: "POST",
    body: JSON.stringify({ title: "Sweatheory" }),
  });
  _cachedShopId = String(shop.id);
  return _cachedShopId;
}

export async function listShops(): Promise<any[]> {
  const data = await printifyFetch<any>("/shops.json");
  return Array.isArray(data) ? data : [];
}

export async function getCatalogBlueprints(): Promise<any[]> {
  const data = await printifyFetch<any>("/catalog/blueprints.json");
  return Array.isArray(data) ? data : (data?.data ?? []);
}

export async function getBlueprint(blueprintId: number): Promise<any> {
  return printifyFetch<any>(`/catalog/blueprints/${blueprintId}.json`);
}

export async function getBlueprintPrintProviders(blueprintId: number): Promise<any[]> {
  const data = await printifyFetch<any>(`/catalog/blueprints/${blueprintId}/print_providers.json`);
  return Array.isArray(data) ? data : (data?.data ?? []);
}

export async function getVariants(blueprintId: number, printProviderId: number): Promise<any> {
  return printifyFetch<any>(
    `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`
  );
}

export async function uploadImageFromUrl(imageUrl: string, fileName: string): Promise<any> {
  return printifyFetch<any>("/uploads/images.json", {
    method: "POST",
    body: JSON.stringify({ file_name: fileName, url: imageUrl }),
  });
}

/**
 * Upload a design image to Printify by sending raw bytes as base64.
 * Printify stores its own copy — the resulting image is independent of our R2 bucket.
 * Use this instead of uploadImageFromUrl when the source is a private R2 object,
 * to avoid Printify needing to reach a presigned URL that may expire.
 */
export async function uploadImageFromBytes(base64Contents: string, fileName: string): Promise<any> {
  return printifyFetch<any>("/uploads/images.json", {
    method: "POST",
    body: JSON.stringify({ file_name: fileName, contents: base64Contents }),
  });
}

export async function createProduct(shopId: string, productData: any): Promise<any> {
  return printifyFetch<any>(`/shops/${shopId}/products.json`, {
    method: "POST",
    body: JSON.stringify(productData),
  });
}

export async function publishProduct(shopId: string, productId: string): Promise<any> {
  return printifyFetch<any>(`/shops/${shopId}/products/${productId}/publish.json`, {
    method: "POST",
    body: JSON.stringify({ title: true, description: true, images: true, variants: true, tags: true }),
  });
}

export async function createOrder(shopId: string, orderData: any): Promise<any> {
  return printifyFetch<any>(`/shops/${shopId}/orders.json`, {
    method: "POST",
    body: JSON.stringify(orderData),
  });
}

export async function getOrder(shopId: string, orderId: string): Promise<any> {
  return printifyFetch<any>(`/shops/${shopId}/orders/${orderId}.json`);
}

type FindByExternalIdResult =
  | { status: "found"; order: any }
  | { status: "not_found" }
  | { status: "inconclusive" };

/**
 * Search Printify orders for one whose external_id matches ours.
 * Paginates up to 5 pages (500 orders). Never throws — returns
 * "inconclusive" on any network/API error so the caller never
 * auto-refunds on an ambiguous result.
 */
export async function findOrderByExternalId(shopId: string, externalId: string): Promise<FindByExternalIdResult> {
  try {
    const perPage = 100;
    const maxPages = 5;
    for (let page = 1; page <= maxPages; page++) {
      const data = await printifyFetch<any>(`/shops/${shopId}/orders.json?page=${page}&limit=${perPage}`);
      const orders: any[] = Array.isArray(data) ? data : (data?.data ?? []);
      const match = orders.find((o: any) => String(o.external_id) === String(externalId));
      if (match) return { status: "found", order: match };
      if (orders.length < perPage) break;
    }
    return { status: "not_found" };
  } catch {
    return { status: "inconclusive" };
  }
}

/** Best-effort cancel — returns true on success, false if the order is already in production or any error occurs. Never throws. */
export async function cancelOrder(shopId: string, printifyOrderId: string): Promise<boolean> {
  try {
    await printifyFetch<any>(`/shops/${shopId}/orders/${printifyOrderId}/cancel.json`, { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

/** Maps Printify blueprint title to our product type enum */
export function blueprintTitleToProductType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("t-shirt") || t.includes("tee") || t.includes("t shirt")) return "shirt";
  if (t.includes("hoodie") || t.includes("hooded") || t.includes("sweatshirt")) return "hoodie";
  if (t.includes("hat") || t.includes("cap") || t.includes("beanie")) return "hat";
  if (t.includes("poster") || t.includes("print")) return "poster";
  if (t.includes("sticker")) return "sticker";
  if (t.includes("mug") || t.includes("cup")) return "mug";
  if (t.includes("tote") || t.includes("bag")) return "tote_bag";
  if (t.includes("phone") || t.includes("case")) return "phone_case";
  if (t.includes("sweatpant") || t.includes("jogger") || t.includes("pant")) return "sweatpants";
  return "shirt";
}

/** Resolve variant color/size name strings from Printify variant options data */
export function resolveVariantNames(variant: any, options: any[]): { color: string; size: string } {
  const colorOpt = options.find((o: any) => o.name === "color" || o.name === "Color");
  const sizeOpt = options.find((o: any) => o.name === "size" || o.name === "Size");

  const colorId = variant.options?.color ?? variant.options?.Color;
  const sizeId = variant.options?.size ?? variant.options?.Size;

  const color = colorOpt?.values?.find((v: any) => v.id === colorId)?.title ?? "";
  const size = sizeOpt?.values?.find((v: any) => v.id === sizeId)?.title ?? "";

  return { color, size };
}
