import { maskPhone } from "../utils/format";
import { SELLER } from "../utils/seller";

/**
 * The policy pages, as data: Terms, Privacy, Refunds & Cancellation, Delivery
 * and Contact. Razorpay reviews these before it takes live payments, and keeps
 * reading them after.
 *
 * Every promise here describes how the site really works, so it stays true:
 * prices and the coupon are worked out on the server, kitchens see only the
 * dishes, the delivery partner sees the guest's name, phone and room once they
 * accept, the accommodation partner sees the room and the time, and an admin
 * refunds a cancelled order from the Razorpay dashboard. Change the system,
 * change the words here with it.
 *
 * No amounts are written in: delivery, packing and the minimum order are
 * settings the super admin changes, and the bill shows them before payment.
 */

export const UPDATED = "20 October 2026";

const phone = maskPhone(SELLER.phone);

const contactLine = `WhatsApp or call ${phone}, or write to ${SELLER.name}, ${SELLER.address}.`;

export const POLICIES = {
  terms: {
    title: "Terms & Conditions",
    intro: [
      `These terms apply when you order food through ${SELLER.name} at inroomdining.in. By placing an order you agree to them.`,
    ],
    sections: [
      {
        h: "Who you are buying from",
        p: [
          `${SELLER.name} is the seller of every order placed on this website. The food is prepared by our partner kitchens in Vrindavan and brought to your room by our delivery partners. The accommodation you are staying at lets us serve its rooms but does not sell the food.`,
        ],
      },
      {
        h: "Who can order",
        p: [
          "Ordering is for guests staying at one of our partner accommodations. You order by scanning the QR code in your room, which tells us where to deliver. Please order only to the room you are staying in.",
        ],
      },
      {
        h: "Menu and prices",
        list: [
          "Everything on the menu is vegetarian.",
          "Prices are in Indian rupees. GST at 5% is added to the food total and shown in your bill.",
          "Delivery and packing charges, any minimum order value and any discount are shown in your bill before you pay. The bill you pay is the one that applies.",
          "Dishes are available only during the hours shown on the menu, while the kitchen preparing them is open. Availability can change at any time.",
          "Photos show how a dish is usually served; portions and presentation may vary slightly.",
        ],
      },
      {
        h: "Allergies and dietary needs",
        p: [
          "Our dishes may contain or come into contact with milk and dairy, nuts, gluten, mustard and sesame. Dishes marked “No onion–garlic” are prepared without onion and garlic. If you have an allergy, tell us in the note at checkout before you pay, but we cannot guarantee any dish is free from a particular ingredient.",
        ],
      },
      {
        h: "Payment",
        p: [
          "Every order is paid in advance, online, through Razorpay. Your order is confirmed and sent to the kitchen only after the payment succeeds. We never see or store your card, UPI or bank details.",
        ],
      },
      {
        h: "Coupons",
        list: [
          "Only one coupon can be used per order.",
          "The best coupon your order qualifies for is applied automatically, and you can remove it or choose another before paying.",
          "Coupons have no cash value, cannot be exchanged, and can be changed or withdrawn at any time.",
        ],
      },
      {
        h: "Cancellations and refunds",
        p: [
          "Cancellations and refunds are covered by our Refund & Cancellation Policy, which forms part of these terms.",
        ],
      },
      {
        h: "Our responsibility",
        p: [
          "If something goes wrong with an order, our responsibility is limited to the amount you paid for that order. We are not responsible for delays or failures caused by events outside our reasonable control, such as severe weather, road closures, festivals and crowd restrictions, or power and network failures.",
        ],
      },
      {
        h: "Fair use",
        p: [
          "Please do not place orders you do not intend to receive, order to rooms you are not staying in, or misuse coupons. We may refuse or cancel such orders.",
        ],
      },
      {
        h: "Changes to these terms",
        p: [
          "We may update these terms. The version shown here, with the date above, applies to orders placed from that date.",
        ],
      },
      {
        h: "Law and disputes",
        p: [
          "These terms are governed by the laws of India. Any dispute will be subject to the courts at Mathura, Uttar Pradesh.",
          contactLine,
        ],
      },
    ],
  },

  privacy: {
    title: "Privacy Policy",
    intro: [
      `This policy explains what ${SELLER.name} collects when you order, why, and who sees it. We collect only what we need to prepare and deliver your food.`,
    ],
    sections: [
      {
        h: "What we collect",
        list: [
          "Your name and mobile number, and your email address if you choose to give it.",
          "The accommodation and room you are ordering to, from the QR code you scanned.",
          "Your order: the dishes, the note you add, the bill, and its status.",
          "The payment reference and status Razorpay sends us. We never receive your card, UPI or bank details.",
          "If you sign in with Google, the name and email address Google shares with us, so we can show your past orders.",
        ],
      },
      {
        h: "How we use it",
        list: [
          "To prepare and deliver your order to your room.",
          "To send you order updates and your receipt on WhatsApp.",
          "To show you your past orders.",
          "To help you if something goes wrong, and to handle refunds.",
          "To keep the accounts and tax records the law requires.",
        ],
        p: ["We do not sell your information, and we do not use it for advertising."],
      },
      {
        h: "Who sees it",
        list: [
          "The kitchen preparing your food sees the dishes and your note, not your name or number.",
          "The delivery partner who accepts your order sees your name, mobile number, accommodation and room, so they can reach you.",
          "Your accommodation is told that an order is coming to your room, with the time and order number.",
          "Razorpay processes your payment.",
          "WhatsApp (Meta) carries our messages to you.",
          "Our website and database are hosted by Vercel and Supabase.",
          "Google, only if you choose to sign in with it.",
        ],
      },
      {
        h: "What is kept on your device",
        p: [
          "Your browser keeps your cart, the room you scanned, links to your recent receipts and, if you ask us to remember them, your checkout details. These stay on your device. We do not use analytics or advertising trackers.",
        ],
      },
      {
        h: "How long we keep it",
        p: [
          "We keep order and payment records for as long as Indian tax and accounting law requires, and delete what we no longer need.",
        ],
      },
      {
        h: "Your choices",
        p: [
          "You can ask to see, correct or delete the information we hold about you, under applicable Indian law including the Digital Personal Data Protection Act, 2023. We will delete it except for records the law requires us to keep.",
          `To ask, or to raise a concern about your data: ${contactLine}`,
        ],
      },
    ],
  },

  refunds: {
    title: "Refund & Cancellation Policy",
    intro: [
      "Every order is paid in advance. This policy explains when an order can be cancelled and how refunds work.",
    ],
    sections: [
      {
        h: "When we cancel an order",
        p: [
          "If we cannot fulfil your order — for example a kitchen cannot prepare it, a dish is no longer available, or no delivery partner can reach you — we cancel it and refund the full amount you paid. You will see the cancellation on your order page.",
        ],
      },
      {
        h: "Cancelling your own order",
        list: [
          `You can cancel for a full refund until the kitchen accepts your order. Contact us on WhatsApp at ${phone} with your order number as soon as possible.`,
          "Once the kitchen has accepted the order and started preparing it, it cannot be cancelled or refunded, because the food is made fresh for you.",
        ],
      },
      {
        h: "Something wrong with your order",
        p: [
          `If an item is missing, wrong or damaged, tell us on WhatsApp at ${phone} within 2 hours of delivery, with your order number and a photo. We will refund the affected items, or replace them where we can.`,
        ],
      },
      {
        h: "Payment taken but no order",
        p: [
          "If money left your account but your order was not confirmed, the payment is refunded in full. Payments that were never completed are reversed automatically by your bank.",
        ],
      },
      {
        h: "How refunds are paid",
        list: [
          "Refunds go back to the payment method you used — UPI, card, net banking or wallet. We do not refund in cash.",
          "We start a refund within 2 working days of agreeing it. Your bank usually credits it within 5–7 working days after that.",
        ],
      },
      {
        h: "If we cannot reach you",
        p: [
          "If the delivery partner cannot reach you at the room or on your mobile number after trying, the order may be treated as delivered and is not refundable. Please keep your phone close while your order is on its way.",
        ],
      },
      {
        h: "Questions",
        p: [contactLine],
      },
    ],
  },

  delivery: {
    title: "Delivery Policy",
    intro: [
      `${SELLER.name} delivers freshly prepared food to guest rooms at our partner accommodations in Vrindavan. We do not ship goods by post or courier.`,
    ],
    sections: [
      {
        h: "Where we deliver",
        p: [
          "Only to rooms at our partner accommodations in Vrindavan, Uttar Pradesh. The QR code in your room tells us which accommodation and room to deliver to.",
        ],
      },
      {
        h: "When we deliver",
        p: [
          "Each dish can be ordered only while it is being served, as shown on the menu. Your order is sent to the kitchen once your payment succeeds.",
        ],
      },
      {
        h: "How long it takes",
        p: [
          "Each dish shows its usual preparation time. Delivery to your room usually adds 15–30 minutes. These are estimates: busy hours, festivals and road conditions in Vrindavan can add to them.",
        ],
      },
      {
        h: "Following your order",
        p: [
          "Your order page shows each step — order received, accepted, out for delivery and delivered — and we send updates on WhatsApp as it moves.",
        ],
      },
      {
        h: "Charges",
        p: [
          "Any delivery charge, packing charge and minimum order value are shown in your bill before you pay. Delivery is free on larger orders, as the bill shows.",
        ],
      },
      {
        h: "At delivery",
        p: [
          "The delivery partner brings the order to your room and may call your mobile number if they cannot find it. If we cannot reach you, our Refund & Cancellation Policy explains what happens.",
        ],
      },
      {
        h: "Questions",
        p: [contactLine],
      },
    ],
  },

  contact: {
    title: "Contact us",
    intro: ["For help with an order, a refund, or anything else, reach us here."],
    sections: [
      {
        h: "WhatsApp and phone",
        p: [`${phone} — please include your order number if you have one.`],
      },
      {
        h: "Address",
        p: [`${SELLER.name}, ${SELLER.address}`],
      },
    ],
  },
};

/** For the footer, in the order shown there. */
export const POLICY_LINKS = [
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/refunds", label: "Refunds & cancellation" },
  { to: "/delivery", label: "Delivery" },
  { to: "/contact", label: "Contact us" },
];
