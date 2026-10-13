"use client";

import { useState } from "react";

export function useAdminPagination<T>(
  items: readonly T[],
  resetKey: string,
  size = 10,
) {
  const [position, setPosition] = useState({ key: resetKey, page: 1 });
  if (position.key !== resetKey) setPosition({ key: resetKey, page: 1 });
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(position.key === resetKey ? position.page : 1, pages);
  return {
    items: items.slice((page - 1) * size, page * size),
    controls: {
      total: items.length,
      size,
      page,
      pages,
      onPage: (value: number) =>
        setPosition({
          key: resetKey,
          page: Math.max(1, Math.min(value, pages)),
        }),
    },
  };
}

export function AdminPagination({
  total,
  size,
  page,
  pages,
  onPage,
}: {
  total: number;
  size: number;
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav className="admin-pagination" aria-label="Navigasi halaman daftar">
      <span role="status">
        {total
          ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} dari ${total}`
          : "0 data"}
      </span>
      <div>
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          aria-label="Halaman sebelumnya"
        >
          ←
        </button>
        <span>
          Halaman {page} / {pages}
        </span>
        <button
          type="button"
          disabled={page === pages}
          onClick={() => onPage(page + 1)}
          aria-label="Halaman berikutnya"
        >
          →
        </button>
      </div>
    </nav>
  );
}
