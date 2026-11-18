/**
 * Server-side PDF page rendering (unpdf + napi-rs canvas), shared by the
 * page-image route and the ingest pipeline's vision-OCR path.
 *
 * Real-world PDFs draw vector graphics (table borders, rules, shapes) through
 * pdfjs's constructPath, which expects a global Path2D - text-only PDFs never
 * touch it. Polyfill the globals from @napi-rs/canvas before rendering.
 */
export async function renderPageToPng(bytes: Uint8Array, page: number): Promise<Uint8Array> {
  const { getDocumentProxy } = await import("unpdf");
  const canvasPkg = await import("@napi-rs/canvas");
  const g = globalThis as Record<string, unknown>;
  if (!g.Path2D) g.Path2D = canvasPkg.Path2D;
  if (!g.ImageData) g.ImageData = canvasPkg.ImageData;

  const pdf = await getDocumentProxy(bytes);
  const pageNum = Math.min(Math.max(1, page), pdf.numPages);
  const pg = await pdf.getPage(pageNum);
  const viewport = pg.getViewport({ scale: 2 });
  const canvas = canvasPkg.createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await pg.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
  } as unknown as Parameters<typeof pg.render>[0]).promise;
  return new Uint8Array(canvas.toBuffer("image/png"));
}

export async function renderPageToDataUrl(bytes: Uint8Array, page: number): Promise<string> {
  const png = await renderPageToPng(bytes, page);
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}
