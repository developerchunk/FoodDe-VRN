import { useCart } from "../context/cart-context";
import { TulsiLeaf } from "./Motifs";

export default function Toast() {
  const { toast } = useCart();
  if (!toast) return null;
  return (
    <div
      className={`toast toast--${toast.tone}`}
      role="status"
      aria-live="polite"
      key={toast.key}
    >
      {toast.tone === "ok" ? (
        <TulsiLeaf size={15} />
      ) : (
        <span aria-hidden="true">!</span>
      )}
      <span>{toast.message}</span>
    </div>
  );
}
