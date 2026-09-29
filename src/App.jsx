import { useEffect } from "react";
import {
  Routes,
  Route,
  useLocation,
  useParams,
  Navigate,
} from "react-router-dom";
import Header from "./components/Header";
import { isMenuPath } from "./utils/routes";
import Footer from "./components/Footer";
import Toast from "./components/Toast";
import MobileCartBar from "./components/MobileCartBar";
import HomePage from "./pages/HomePage";
import MenuPage from "./pages/MenuPage";
import CartPage from "./pages/CartPage";
import CheckoutPage from "./pages/CheckoutPage";
import OrderSuccessPage from "./pages/OrderSuccessPage";
import ReceiptPage from "./pages/ReceiptPage";
import OrdersPage from "./pages/OrdersPage";
import ErrorBoundary from "./components/ErrorBoundary";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!isMenuPath(pathname)) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/* Stickers printed before /menu?id= existed still carry /r/<code>. */
function LegacyRoomLink() {
  const { code } = useParams();
  return <Navigate to={`/menu?id=${encodeURIComponent(code)}`} replace />;
}

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ScrollToTop />
      <Header />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/menu" element={<MenuPage />} />
          {/* a room link is /menu?id=<opaque code>; the id resolves to the
              guest house and room (see utils/property) */}
          <Route path="/r/:code" element={<LegacyRoomLink />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order/:id" element={<OrderSuccessPage />} />
          <Route path="/receipt/:id" element={<ReceiptPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </ErrorBoundary>
      <Footer />
      <MobileCartBar />
      <Toast />
    </>
  );
}
