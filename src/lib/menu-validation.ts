import { ApiError } from "@/lib/api-auth";
import { parseMoney } from "@/lib/money";

export type MenuItemInput = {
  name: string;
  description: string | null;
  price: number;
  costPrice: number;
  categoryId: string;
  available: boolean;
  sortOrder: number;
};

/**
 * Validate and normalise the menu item form payload. Shared by create (where
 * every required field must be present) and update (where any subset may be).
 */
export function parseMenuItem(
  body: Record<string, unknown>,
  { partial }: { partial: boolean },
): Partial<MenuItemInput> {
  const out: Partial<MenuItemInput> = {};

  if (body.name !== undefined || !partial) {
    const name = String(body.name ?? "").trim();
    if (!name) throw new ApiError(400, "The item needs a name.");
    out.name = name.slice(0, 120);
  }

  if (body.description !== undefined) {
    const description = String(body.description ?? "").trim();
    out.description = description ? description.slice(0, 300) : null;
  }

  if (body.price !== undefined || !partial) {
    const price = parseMoney(body.price as string | number);
    if (price === null || price < 0) {
      throw new ApiError(400, "Enter a valid selling price.");
    }
    out.price = price;
  }

  if (body.costPrice !== undefined || !partial) {
    const cost = parseMoney((body.costPrice as string | number) ?? 0);
    if (cost === null || cost < 0) {
      throw new ApiError(400, "Enter a valid cost price.");
    }
    out.costPrice = cost;
  }

  if (body.categoryId !== undefined || !partial) {
    const categoryId = String(body.categoryId ?? "").trim();
    if (!categoryId) throw new ApiError(400, "Pick a category.");
    out.categoryId = categoryId;
  }

  if (body.available !== undefined) out.available = Boolean(body.available);

  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    out.sortOrder = Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0;
  }

  return out;
}
