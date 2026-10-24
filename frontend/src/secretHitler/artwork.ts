export type InkPalette = 'blue' | 'red' | 'green';
type RGB = readonly [number, number, number];

// A single print palette is shared by the 2D SVG filters and 3D canvas textures.
// Original silhouettes, lettering, stippling and alpha remain intact.
export const inkPalettes: Record<InkPalette, readonly RGB[]> = {
  blue: [[20,55,79], [29,84,113], [42,126,160], [118,174,194], [224,238,243]],
  red: [[79,29,27], [126,45,37], [174,70,56], [215,145,116], [245,227,213]],
  green: [[27,62,42], [47,94,61], [78,132,84], [156,188,132], [231,239,222]],
};

export function artworkPalette(url: string): InkPalette | undefined {
  if (/ballot-ja\./.test(url)) return 'green';
  if (/liberal|president\./.test(url)) return 'blue';
  if (/fascist|hitler\.|ballot-nein\.|chancellor\./.test(url)) return 'red';
  return undefined;
}

export function inkAt(gray: number, palette: InkPalette): RGB {
  const colors = inkPalettes[palette];
  const position = Math.max(0, Math.min(255, gray)) / 255 * (colors.length - 1);
  const start = Math.floor(position), end = Math.min(colors.length - 1, start + 1);
  const fraction = position - start;
  const blend = (channel: number) => Math.round(colors[start][channel] +
    (colors[end][channel] - colors[start][channel]) * fraction);
  return [blend(0), blend(1), blend(2)];
}

const tables = new Map<InkPalette, Uint8ClampedArray>();
export function colorizeArtworkPixels(pixels: Uint8ClampedArray, palette: InkPalette): void {
  let table = tables.get(palette);
  if (!table) {
    table = new Uint8ClampedArray(256 * 3);
    for (let gray = 0; gray < 256; gray++) table.set(inkAt(gray, palette), gray * 3);
    tables.set(palette, table);
  }
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const index = Math.round(pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722) * 3;
    pixels[offset] = table[index]; pixels[offset + 1] = table[index + 1]; pixels[offset + 2] = table[index + 2];
  }
}

/** Render colored ink in the game; keep the supplied source files unchanged. */
export function colorizedArtworkSource(image: HTMLImageElement, url: string): HTMLImageElement | HTMLCanvasElement {
  const palette = artworkPalette(url);
  if (!palette) return image;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) return image;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    colorizeArtworkPixels(pixels.data, palette);
    context.putImageData(pixels, 0, 0);
    return canvas;
  } catch {
    // Restricted image/canvas environments still show the original printed art.
    return image;
  }
}
