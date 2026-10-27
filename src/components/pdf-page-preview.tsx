"use client";

import { useEffect, useRef, useState } from "react";

/** Render the selected PDF page even on browsers without an inline PDF viewer. */
export function PdfPagePreview({
  url,
  page,
  label,
  onReady,
}: {
  url: string;
  page: number;
  label: string;
  onReady?: (ready: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState("Memuat halaman PDF…");
  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    onReady?.(false);
    async function render() {
      const pdfjs = await import("pdfjs-dist");
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({
        url,
        withCredentials: true,
        cMapUrl: "/pdfjs/cmaps/",
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        wasmUrl: "/pdfjs/wasm/",
        iccUrl: "/pdfjs/iccs/",
      });
      dispose = () => {
        void task.destroy();
      };
      const document = await task.promise;
      const source = await document.getPage(page);
      if (!active || !canvas.current) return;
      const viewport = source.getViewport({ scale: 1.5 });
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      const context = canvas.current.getContext("2d");
      if (!context)
        throw new Error("Browser tidak dapat menampilkan halaman PDF.");
      await source.render({
        canvas: canvas.current,
        canvasContext: context,
        viewport,
      }).promise;
      if (active) {
        setState("");
        onReady?.(true);
      }
    }
    void render().catch(() => {
      if (active) {
        setState(
          "Halaman PDF gagal ditampilkan. Buka PDF di tab baru untuk memeriksa, lalu muat ulang preview sebelum menyimpan.",
        );
        onReady?.(false);
      }
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, [url, page, onReady]);
  return (
    <div className="pdf-preview-container">
      <label className="pdf-preview-toolbar">
        Perbesaran {label}
        <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
          <option value={1}>Sesuai lebar</option>
          <option value={1.5}>150%</option>
          <option value={2}>200%</option>
          <option value={3}>300%</option>
        </select>
      </label>
      <div className="pdf-page-preview" aria-label={label}>
        {state && <p role="status">{state}</p>}
        <canvas
          ref={canvas}
          style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
          role="img"
          aria-label={`${label}, halaman ${page}`}
          hidden={Boolean(state)}
        />
      </div>
    </div>
  );
}
