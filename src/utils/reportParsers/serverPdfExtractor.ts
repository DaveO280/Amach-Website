/**
 * Server-side PDF text extractor using pdfjs-dist in Node.js.
 *
 * pdfjs-dist supports both browser and Node.js environments. On the server we
 * disable the worker entirely (workerSrc = "") so the library runs synchronously
 * on the main thread — no canvas, no shared-memory buffers required.
 *
 * Used by API routes that receive a PDF Buffer/Uint8Array directly, bypassing
 * the client-side FileReader path in pdfParser.ts.
 */

export interface ServerPDFResult {
  text: string;
  pageCount: number;
}

export async function extractTextFromPdfBuffer(
  buffer: Buffer | Uint8Array,
): Promise<ServerPDFResult> {
  if (typeof window !== "undefined") {
    throw new Error("serverPdfExtractor must only be called server-side");
  }

  // Dynamic import keeps pdfjs-dist out of the client bundle.
  // Listed in serverExternalPackages so Next.js doesn't try to bundle it.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Disable web worker — not available in Node.js without extra setup
  pdfjs.GlobalWorkerOptions.workerSrc = "";

  const data = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer;

  const loadingTask = pdfjs.getDocument({
    data,
    verbosity: 0,
    useSystemFonts: true,
    // Disable features that require native canvas
    isEvalSupported: false,
  });

  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  let fullText = "";

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // pdfjs-dist already includes space items in the stream — join with ""
      // preserves natural spacing without adding extra gaps.
      const pageText = textContent.items
        .map((item: { str?: string; [key: string]: unknown }) =>
          "str" in item ? (item.str as string) : "",
        )
        .join("");

      fullText += `Page ${pageNum}:\n${pageText}\n\n`;
    } catch {
      fullText += `Page ${pageNum}:\n[Error reading page content]\n\n`;
    }
  }

  return { text: fullText.trim(), pageCount };
}
