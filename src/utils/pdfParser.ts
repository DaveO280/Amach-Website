// Only import and use PDF.js on the client side
let getDocument: typeof import("pdfjs-dist").getDocument | undefined;

if (typeof window !== "undefined") {
  // Dynamic import to avoid server-side issues
  import("pdfjs-dist").then((pdfjsLib) => {
    getDocument = pdfjsLib.getDocument;
    // Disable worker and use main thread for parsing
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";
  });
}

export interface PDFParseResult {
  text: string;
  pageCount: number;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
  };
}

export interface PDFAnalysisResult {
  pageCount: number;
  fileSize: number;
  hasText: boolean;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
  };
}

/**
 * Parse a PDF file and extract its text content
 */
export async function parsePDF(file: File): Promise<PDFParseResult> {
  // Ensure we're on the client side
  if (typeof window === "undefined") {
    throw new Error("PDF parsing is only available on the client side");
  }

  // Dynamically import PDF.js if not already loaded
  if (!getDocument) {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      getDocument = pdfjsLib.getDocument;
      // Disable worker and use main thread for parsing
      pdfjsLib.GlobalWorkerOptions.workerSrc = "";
    } catch (error) {
      throw new Error(
        `Failed to load PDF.js library: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return new Promise((resolve, reject): void => {
    const reader = new FileReader();

    reader.onload = async (e): Promise<void> => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        // Load the PDF document
        if (!getDocument) {
          throw new Error("PDF.js not loaded");
        }

        const loadingTask = getDocument({
          data: arrayBuffer,
          // Use main thread for parsing
          verbosity: 0,
          useSystemFonts: true,
        });

        const pdf = await loadingTask.promise;

        const pageCount = pdf.numPages;
        let fullText = "";

        // Extract text from each page
        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          try {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Log detailed information about the page
            console.log(`Page ${pageNum}:`, {
              itemCount: textContent.items.length,
              hasText: textContent.items.some(
                (item: { str?: string; [key: string]: unknown }) =>
                  item.str && item.str.trim().length > 0,
              ),
              sampleItems: textContent.items
                .slice(0, 3)
                .map(
                  (item: {
                    str?: string;
                    transform?: unknown;
                    width?: number;
                    height?: number;
                    [key: string]: unknown;
                  }) => ({
                    str: item.str,
                    transform: item.transform,
                    width: item.width,
                    height: item.height,
                  }),
                ),
            });

            // Combine text items from the page
            const pageText = textContent.items
              .map((item: { str?: string; [key: string]: unknown }) => {
                if ("str" in item) {
                  return item.str;
                }
                return "";
              })
              .join(" ");

            fullText += `Page ${pageNum}:\n${pageText}\n\n`;
          } catch (pageError) {
            // If a page fails, continue with other pages
            console.error(`Error reading page ${pageNum}:`, pageError);
            fullText += `Page ${pageNum}:\n[Error reading page content]\n\n`;
          }
        }

        // Get metadata if available
        let metadata;
        try {
          const rawMetadata = await pdf.getMetadata();
          // Convert PDF metadata to our expected format
          const info = rawMetadata?.info as Record<string, string> | undefined;
          metadata = {
            title: info?.Title || undefined,
            author: info?.Author || undefined,
            subject: info?.Subject || undefined,
            creator: info?.Creator || undefined,
            producer: info?.Producer || undefined,
          };
        } catch (metadataError) {
          // Metadata is optional, so we can continue without it
          metadata = undefined;
        }

        resolve({
          text: fullText.trim(),
          pageCount,
          metadata: metadata || undefined,
        });
      } catch (error) {
        reject(
          new Error(
            `PDF parsing error: ${error instanceof Error ? error.message : "Unknown error"}`,
          ),
        );
      }
    };

    reader.onerror = (): void => {
      reject(new Error("Failed to read PDF file"));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Analyze a PDF file to get basic information without full parsing
 */
export async function analyzePDF(file: File): Promise<PDFAnalysisResult> {
  // Ensure we're on the client side
  if (typeof window === "undefined") {
    throw new Error("PDF analysis is only available on the client side");
  }

  // Dynamically import PDF.js if not already loaded
  if (!getDocument) {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      getDocument = pdfjsLib.getDocument;
      // Disable worker and use main thread for parsing
      pdfjsLib.GlobalWorkerOptions.workerSrc = "";
    } catch (error) {
      throw new Error(
        `Failed to load PDF.js library: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return new Promise((resolve, reject): void => {
    const reader = new FileReader();

    reader.onload = async (e): Promise<void> => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        // Load the PDF document
        if (!getDocument) {
          throw new Error("PDF.js not loaded");
        }

        const loadingTask = getDocument({
          data: arrayBuffer,
          // Use main thread for parsing (no worker)
          verbosity: 0,
          useSystemFonts: true,
        });

        const pdf = await loadingTask.promise;

        const pageCount = pdf.numPages;

        // Check if the first page has text content
        let hasText = false;
        try {
          const firstPage = await pdf.getPage(1);
          const textContent = await firstPage.getTextContent();
          hasText = textContent.items.length > 0;
        } catch (error) {
          // If we can't get text content, assume it might be an image-based PDF
          hasText = false;
        }

        // Get metadata if available
        let metadata;
        try {
          const rawMetadata = await pdf.getMetadata();
          // Convert PDF metadata to our expected format
          const info = rawMetadata?.info as Record<string, string> | undefined;
          metadata = {
            title: info?.Title || undefined,
            author: info?.Author || undefined,
            subject: info?.Subject || undefined,
            creator: info?.Creator || undefined,
            producer: info?.Producer || undefined,
          };
        } catch (metadataError) {
          // Metadata is optional, so we can continue without it
          metadata = undefined;
        }

        resolve({
          pageCount,
          fileSize: file.size,
          hasText,
          metadata: metadata || undefined,
        });
      } catch (error) {
        reject(
          new Error(
            `PDF analysis error: ${error instanceof Error ? error.message : "Unknown error"}`,
          ),
        );
      }
    };

    reader.onerror = (): void => {
      reject(new Error("Failed to read PDF file"));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Get detailed analysis of PDF structure and content
 */
export async function getDetailedPDFAnalysis(file: File): Promise<{
  basicInfo: PDFAnalysisResult;
  detailedInfo: {
    pageDetails: Array<{
      pageNumber: number;
      itemCount: number;
      hasText: boolean;
      textLength: number;
      sampleText: string;
    }>;
    totalTextItems: number;
    textPages: number;
    imagePages: number;
    errorPages: number;
  };
}> {
  // Ensure we're on the client side
  if (typeof window === "undefined") {
    throw new Error("PDF analysis is only available on the client side");
  }

  // Dynamically import PDF.js if not already loaded
  if (!getDocument) {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      getDocument = pdfjsLib.getDocument;
      // Disable worker and use main thread for parsing
      pdfjsLib.GlobalWorkerOptions.workerSrc = "";
    } catch (error) {
      throw new Error(
        `Failed to load PDF.js library: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return new Promise((resolve, reject): void => {
    const reader = new FileReader();

    reader.onload = async (e): Promise<void> => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        // Load the PDF document
        if (!getDocument) {
          throw new Error("PDF.js not loaded");
        }

        const loadingTask = getDocument({
          data: arrayBuffer,
          // Use main thread for parsing (no worker)
          verbosity: 0,
          useSystemFonts: true,
        });

        const pdf = await loadingTask.promise;
        const pageCount = pdf.numPages;

        // Get basic info first
        const basicInfo = await analyzePDF(file);

        // Analyze each page in detail
        const pageDetails = [];
        let totalTextItems = 0;
        let textPages = 0;
        let imagePages = 0;
        let errorPages = 0;

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          try {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            const itemCount = textContent.items.length;
            const hasText = textContent.items.some(
              (item: { str?: string; [key: string]: unknown }) =>
                item.str && item.str.trim().length > 0,
            );
            const textLength = textContent.items
              .map(
                (item: { str?: string; [key: string]: unknown }) =>
                  item.str || "",
              )
              .join(" ").length;
            const sampleText = textContent.items
              .slice(0, 3)
              .map(
                (item: { str?: string; [key: string]: unknown }) =>
                  item.str || "",
              )
              .join(" ")
              .substring(0, 100);

            pageDetails.push({
              pageNumber: pageNum,
              itemCount,
              hasText,
              textLength,
              sampleText,
            });

            totalTextItems += itemCount;
            if (hasText) {
              textPages++;
            } else {
              imagePages++;
            }
          } catch (error) {
            console.error(`Error analyzing page ${pageNum}:`, error);
            pageDetails.push({
              pageNumber: pageNum,
              itemCount: 0,
              hasText: false,
              textLength: 0,
              sampleText: "Error reading page",
            });
            errorPages++;
          }
        }

        resolve({
          basicInfo,
          detailedInfo: {
            pageDetails,
            totalTextItems,
            textPages,
            imagePages,
            errorPages,
          },
        });
      } catch (error) {
        reject(
          new Error(
            `PDF analysis error: ${error instanceof Error ? error.message : "Unknown error"}`,
          ),
        );
      }
    };

    reader.onerror = (): void => {
      reject(new Error("Failed to read PDF file"));
    };

    reader.readAsArrayBuffer(file);
  });
}
