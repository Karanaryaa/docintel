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
  const g = globalThis as Record<string | symbol, unknown>;
  if (!g.Path2D) g.Path2D = canvasPkg.Path2D;
  if (!g.ImageData) g.ImageData = canvasPkg.ImageData;
  // Pages with embedded raster images make pdfjs create scratch canvases
  // through unpdf's NodeCanvasFactory, which reads this global. Without it,
  // image pages fail with "@napi-rs/canvas is not available".
  const slot = Symbol.for("unpdf.canvasModule");
  if (!g[slot]) g[slot] = canvasPkg;

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

/**
 * For scanned pages (one big embedded raster per page), pull the embedded
 * image straight out of the PDF instead of running pdfjs's full renderer.
 * pg.render can fail in serverless background tasks (after()) with
 * "Cannot transfer object of unsupported type" on image pages; this path
 * never touches it. Returns null when the page has no large embedded image
 * (caller falls back to renderPageToPng).
 */
export async function extractEmbeddedPagePng(bytes: Uint8Array, page: number): Promise<Uint8Array | null> {
  const { extractImages } = await import("unpdf");
  const canvasPkg = await import("@napi-rs/canvas");
  const images = await extractImages(bytes, page);
  const img = images.reduce<(typeof images)[number] | null>(
    (best, cur) => (cur.width * cur.height > (best?.width ?? 0) * (best?.height ?? 0) ? cur : best),
    null
  );
  // A page scan is a large image; small ones are logos/decorations.
  if (!img || img.width * img.height < 300 * 300) return null;

  const px = img.width * img.height;
  const rgba = new Uint8ClampedArray(px * 4);
  if (img.channels === 4) {
    rgba.set(img.data.subarray(0, px * 4));
  } else if (img.channels === 3) {
    for (let i = 0, j = 0; j < rgba.length; i += 3, j += 4) {
      rgba[j] = img.data[i];
      rgba[j + 1] = img.data[i + 1];
      rgba[j + 2] = img.data[i + 2];
      rgba[j + 3] = 255;
    }
  } else {
    for (let i = 0, j = 0; j < rgba.length; i += 1, j += 4) {
      rgba[j] = rgba[j + 1] = rgba[j + 2] = img.data[i];
      rgba[j + 3] = 255;
    }
  }
  const canvas = canvasPkg.createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new canvasPkg.ImageData(rgba, img.width, img.height), 0, 0);
  return new Uint8Array(canvas.toBuffer("image/png"));
}
