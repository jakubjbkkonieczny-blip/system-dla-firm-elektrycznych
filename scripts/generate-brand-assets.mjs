/**
 * Derives PWA + OG assets from public/icon-512.png (master, never overwritten).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const MASTER = path.join(ROOT, "public", "icon-512.png");

async function resizeIcon(size, outPath) {
  await sharp(MASTER)
    .resize(size, size)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);
}

async function createOgImage(outPath) {
  const width = 1200;
  const height = 630;
  const logoMax = 300;
  const src = await sharp(MASTER).metadata();
  const scale = logoMax / Math.max(src.width, src.height);
  const lw = Math.round(src.width * scale);
  const lh = Math.round(src.height * scale);
  const logoLeft = Math.round((width - lw) / 2);
  const logoTop = 72;

  const logo = await sharp(MASTER)
    .resize(lw, lh, { fit: "inside", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  const svgOverlay = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#070d18"/>
        <stop offset="100%" stop-color="#0c1528"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="35%" r="55%">
        <stop offset="0%" stop-color="rgba(56,189,248,0.16)"/>
        <stop offset="100%" stop-color="rgba(56,189,248,0)"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect width="${width}" height="${height}" fill="url(#glow)"/>
    <text x="600" y="${logoTop + lh + 56}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#f8fafc">VectorWork</text>
    <text x="600" y="${logoTop + lh + 104}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#94a3b8">System dla firm technicznych</text>
  </svg>`);

  await sharp(svgOverlay)
    .composite([{ input: logo, left: logoLeft, top: logoTop }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function main() {
  if (!fs.existsSync(MASTER)) {
    throw new Error("Missing master asset: public/icon-512.png");
  }

  await resizeIcon(192, path.join(ROOT, "public", "icon-192.png"));
  await resizeIcon(180, path.join(ROOT, "public", "apple-touch-icon.png"));
  await resizeIcon(32, path.join(ROOT, "public", "favicon.png"));
  await createOgImage(path.join(ROOT, "public", "og-image.png"));

  const appDir = path.join(ROOT, "app");
  if (fs.existsSync(appDir)) {
    await resizeIcon(32, path.join(appDir, "icon.png"));
    await resizeIcon(180, path.join(appDir, "apple-icon.png"));
  }

  const master = await sharp(MASTER).metadata();
  console.log("master (unchanged)", `${master.width}x${master.height}`);
  for (const f of [
    "public/icon-192.png",
    "public/favicon.png",
    "public/apple-touch-icon.png",
    "public/og-image.png",
  ]) {
    const m = await sharp(path.join(ROOT, f)).metadata();
    console.log(f, `${m.width}x${m.height}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
