/**
 * Server-side PDF-to-PNG renderer.
 *
 * Uses pdfjs-dist (legacy/Node build) + @napi-rs/canvas (pre-built Rust
 * binaries — no native compilation needed) to rasterize PDF pages.
 *
 * Called only from runVisionPass() in the registry pipeline.
 * Never imported on the client side.
 */

/**
 * Render a set of 1-indexed PDF page numbers to base64-encoded PNG strings.
 * Returns one string per page in the same order as pageNums.
 */
export async function renderPdfPages(
  pdfData: Uint8Array,
  pageNums: number[],
  scale = 1.5,
): Promise<string[]> {
  if (pageNums.length === 0) return [];

  // pdfjs transfers pdfData.buffer to its worker (detaching the original).
  // When called concurrently with the same Uint8Array, the first call detaches
  // the shared buffer and all subsequent calls fail with DataCloneError.
  // Make a defensive copy SYNCHRONOUSLY before any await so each concurrent
  // invocation gets its own independent ArrayBuffer.
  if (pdfData.byteLength === 0) {
    throw new Error(
      "[pdfRenderer] pdfData buffer is already detached (byteLength=0) — pass a fresh Uint8Array",
    );
  }
  const dataCopy = new Uint8Array(
    pdfData.buffer.slice(
      pdfData.byteOffset,
      pdfData.byteOffset + pdfData.byteLength,
    ),
  );

  // Dynamic imports prevent Next.js from bundling these Node-only modules.
  const pdfjsMod = await import(
    "pdfjs-dist/legacy/build/pdf.mjs" as string
  ).catch(() => null);

  if (!pdfjsMod) {
    throw new Error("[pdfRenderer] pdfjs-dist is not available");
  }

  const { getDocument, GlobalWorkerOptions } = pdfjsMod as {
    getDocument: (opts: {
      data: Uint8Array;
      useWorkerFetch?: boolean;
      useSystemFonts?: boolean;
      isEvalSupported?: boolean;
    }) => {
      promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<PdfPage>;
      }>;
    };
    GlobalWorkerOptions: { workerSrc: string };
  };

  // Resolve the worker as a file URL — pdfjs requires this in Node.js contexts.
  // Using process.cwd() + known relative path mirrors how the reliability test
  // sets workerSrc and avoids import.meta.url resolution issues in tsx/CJS.
  const { resolve } = await import("path");
  const { pathToFileURL } = await import("url");
  const workerPath = resolve(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  );
  GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();

  const canvasMod = await import("@napi-rs/canvas").catch(() => null);
  if (!canvasMod) {
    throw new Error("[pdfRenderer] @napi-rs/canvas is not available");
  }
  const { createCanvas } = canvasMod as {
    createCanvas: (w: number, h: number) => PdfCanvas;
  };

  const pdf = await getDocument({
    data: dataCopy,
    useWorkerFetch: false,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const results: string[] = [];

  for (const pageNum of pageNums) {
    if (pageNum < 1 || pageNum > pdf.numPages) {
      console.warn(
        `[pdfRenderer] Page ${pageNum} out of range (1–${pdf.numPages}), skipping`,
      );
      continue;
    }

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(
      Math.floor(viewport.width),
      Math.floor(viewport.height),
    );
    const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

    // White background (PDFs may have transparent BG)
    (ctx as unknown as { fillStyle: string }).fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, intent: "print" })
      .promise;

    const pngBuf: Buffer = canvas.toBuffer("image/png");
    results.push(pngBuf.toString("base64"));
  }

  return results;
}

// ── Minimal structural types for the dynamic imports ─────────────────────────

interface PdfPage {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    intent?: string;
  }) => { promise: Promise<void> };
}

interface PdfCanvas {
  width: number;
  height: number;
  getContext: (type: "2d") => unknown;
  toBuffer: (fmt: string) => Buffer;
}
