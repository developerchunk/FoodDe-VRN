const KEY = "brajrasoi.orders.v1";

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
};

const write = (orders) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(orders));
  } catch {
    /* storage blocked — the demo still works for the current page view */
  }
};

export function makeOrderId() {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BR-${stamp}-${rand}`;
}

export function saveOrder(order) {
  const orders = read();
  orders.unshift(order);
  write(orders.slice(0, 25));
  return order;
}

export const getOrders = () => read();
export const getOrder = (id) => read().find((o) => o.id === id) || null;
