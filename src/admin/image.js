/**
 * Dish photos are made small on the admin's own device, before upload.
 *
 * A phone photo is 3-12 MB and 4000 px wide; a guest on hotel Wi-Fi scrolling a
 * menu of forty dishes would pull hundreds of megabytes. So every photo becomes
 * the same thing: a 480x480 square JPEG, centre-cropped, of about 100 KB.
 * Doing it here rather than on a server means the original never leaves the
 * admin's phone, and there is no image service to run.
 */

export const SIZE = 480;
/** Aim for this, and stop lowering quality once under it. */
const TARGET_BYTES = 100 * 1024;
/** Below this the food starts to look like food photographed through glass. */
const MIN_QUALITY = 0.55;

const toBlob = (canvas, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("This browser could not encode the photo."))),
      "image/jpeg",
      quality,
    ),
  );

async function decode(file) {
  /* createImageBitmap honours the EXIF rotation, so a portrait phone photo is
     not cropped sideways. Older Safari lacks the option; fall back to <img>,
     which applies EXIF itself. */
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Any image file in, a square 480x480 JPEG Blob out.
 * Resolves { blob, width, height, bytes, quality }.
 */
export async function prepareDishPhoto(file) {
  if (!file || !/^image\//.test(file.type)) {
    throw new Error("Please choose a photo (JPEG, PNG, WebP or HEIC).");
  }

  let source;
  try {
    source = await decode(file);
  } catch {
    throw new Error(
      "This photo could not be read. If it came from an iPhone, share it as JPEG (Most Compatible) and try again.",
    );
  }

  const w = source.width;
  const h = source.height;
  if (!w || !h) throw new Error("This photo appears to be empty.");

  /* Centre crop: the largest square that fits, from the middle. A dish is
     almost always photographed in the centre of the frame. */
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  /* A transparent PNG would otherwise turn black in JPEG. */
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, side, side, 0, 0, SIZE, SIZE);
  source.close?.();

  let quality = 0.86;
  let blob = await toBlob(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - 0.08);
    blob = await toBlob(canvas, quality);
  }

  return { blob, width: SIZE, height: SIZE, bytes: blob.size, quality };
}

export const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
