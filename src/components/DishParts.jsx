import DishArt from "./DishArt";
import QtyStepper from "./QtyStepper";
import { useCart } from "../context/cart-context";
import { CartIcon } from "./Icons";

/* The two pieces a dish card and its details sheet share: the Add control
   (Add, the stepper, or Unavailable) and the square picture. */

export function AddControl({ item, size }) {
  const { add, decrement, qtyOf } = useCart();
  const qty = qtyOf(item.id);
  if (!item.availableNow) return <span className="dish__closed">Unavailable</span>;
  if (qty > 0)
    return (
      <QtyStepper
        qty={qty}
        size={size}
        label={item.name}
        onAdd={() => add(item)}
        onRemove={() => decrement(item.id)}
      />
    );
  return (
    <button type="button" className="dish__add" onClick={() => add(item)}>
      <CartIcon size={16} />
      Add<span className="dish__add-long"> to Cart</span>
    </button>
  );
}

export function DishPicture({ item, className = "dish__art", eager = false }) {
  return item.imageUrl ? (
    <img
      className={className}
      src={item.imageUrl}
      alt=""
      width="480"
      height="480"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  ) : (
    <DishArt item={item} className={className} />
  );
}
