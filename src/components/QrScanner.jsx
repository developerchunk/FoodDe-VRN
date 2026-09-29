import { useEffect, useRef, useState } from "react";

/**
 * Scans the QR sticker with the device camera.
 *
 * Two decoders, by necessity. Chrome and Android have BarcodeDetector built in:
 * native, fast, and nothing to download. Safari does not implement it at all,
 * and iPhones are most of what a rest house guest is holding — so jsQR is
 * loaded, only on those browsers and only when the scanner is actually opened,
 * rather than shipping a decoder to everyone who never scans anything.
 */
export default function QrScanner({ onCode, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let stream = null;
    let raf = 0;
    let stopped = false;

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          /* the back camera on a phone, which is the one facing the wall */
          video: { facingMode: { ideal: "environment" } },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        /* iOS will not play an inline video without this pair, and a video that
           never plays yields frames that never decode. */
        video.setAttribute("playsinline", "true");
        await video.play();

        const native =
          "BarcodeDetector" in window
            ? new window.BarcodeDetector({ formats: ["qr_code"] })
            : null;
        const jsQR = native ? null : (await import("jsqr")).default;

        const readFrame = async () => {
          if (native) {
            const found = await native.detect(video);
            return found[0]?.rawValue ?? null;
          }
          const canvas = canvasRef.current;
          if (!canvas || !video.videoWidth) return null;
          /* Decoding every frame at full resolution burns a phone battery for
             no benefit; a QR fills enough of a 360px frame to read. */
          const scale = Math.min(1, 360 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const { data, width, height } = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
          return jsQR(data, width, height, { inversionAttempts: "dontInvert" })
            ?.data ?? null;
        };

        const tick = async () => {
          if (stopped) return;
          try {
            const value = await readFrame();
            if (value) {
              stop();
              onCode(value);
              return;
            }
          } catch {
            /* a frame that could not be read is not a failure; try the next */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (err) {
        setError(
          err?.name === "NotAllowedError"
            ? "Camera access was declined. Enter the QR Code ID instead."
            : "Could not open the camera. Enter the QR Code ID instead.",
        );
      }
    })();

    return stop;
  }, [onCode]);

  return (
    <div className="qr-scan">
      {error ? (
        <p className="side-card__error" role="alert">
          {error}
        </p>
      ) : (
        <div className="qr-scan__frame">
          <video ref={videoRef} playsInline muted className="qr-scan__video" />
          <canvas ref={canvasRef} className="qr-scan__canvas" aria-hidden="true" />
          <span className="qr-scan__reticle" aria-hidden="true" />
        </div>
      )}
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
