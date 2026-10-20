import { Pagination } from "../domain/repositories/Pagination";

export type { Pagination } from "../domain/repositories/Pagination";

export type Paginated<T> = {
  data: T[];
  pagination: Pagination & { hasNext: boolean };
};

export function paginate<T>(items: T[], { page, limit }: Pagination): Paginated<T> {
  return {
    data: items.slice(0, limit),
    pagination: { page, limit, hasNext: items.length > limit },
  };
}
