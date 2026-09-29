/**
 * Whether scanning is worth offering at all.
 *
 * Every browser can decode now — Chrome natively, Safari through jsQR, which
 * the scanner loads on demand. What is not universal is a camera: a desktop
 * without one, or a page not served over https, cannot scan whatever the
 * decoder can do. getUserMedia is simply absent in those cases, so the button
 * is not offered and the QR Code ID field is the way in.
 */
export const canScanQr = () =>
  typeof navigator !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia);
