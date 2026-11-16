export type Quake = {
  id: string;
  magnitude: number;
  lon: number;
  lat: number;
  time: string;
  place: string;
  col: number;
  row: number;
};

export type Meta = {
  site: string;
  name: string;
  place: string;
  size: number;
  pixel_m: number;
  extent_km: number;
  bounds: { west: number; south: number; east: number; north: number };
  pair: { reference: string; secondary: string; days: number; track: number; direction: string; frame: number };
  source: { gunw: string; dem: string[]; dem_product: string };
  displacement: { units: "cm"; limit: number; min: number; max: number; p1: number; p99: number };
  coherence: { threshold: number };
  height: { min_m: number; max_m: number };
  quakes: Quake[];
  nearby_quakes: (Quake & { km_from_main: number })[];
};

/** One site's grid, row-major from the north-west corner, `size` by `size` samples. */
export type Field = {
  meta: Meta;
  height: Float32Array; // metres
  displacement: Float32Array; // cm along the line of sight, positive toward the satellite
  coherence: Float32Array; // 0..1, zero where the radar could not measure
};

async function bytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.arrayBuffer();
}

async function grey(url: string, size: number): Promise<Float32Array> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: "none" });
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  ctx.drawImage(bitmap, 0, 0);
  const rgba = ctx.getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4] / 255;
  return out;
}

export async function loadField(site: string): Promise<Field> {
  const base = `/explore/${site}`;
  const meta: Meta = await (await fetch(`${base}/meta.json`)).json();
  const n = meta.size * meta.size;
  const [h, d, coherence] = await Promise.all([bytes(`${base}/height.bin`), bytes(`${base}/displacement.bin`), grey(`${base}/coherence.png`, meta.size)]);
  const h16 = new Uint16Array(h);
  const d16 = new Int16Array(d);
  const height = new Float32Array(n);
  const displacement = new Float32Array(n);
  const span = meta.height.max_m - meta.height.min_m;
  for (let i = 0; i < n; i++) {
    height[i] = meta.height.min_m + (h16[i] / 65535) * span;
    displacement[i] = d16[i] / 10;
  }
  return { meta, height, displacement, coherence };
}
