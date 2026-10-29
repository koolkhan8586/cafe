export const ROLES = ["EMPLOYEE", "ADMIN", "MANAGER"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  "PENDING",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/// Which statuses an order may legally move to from its current one.
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "New",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/// Orders in these statuses count as revenue. A cancelled order never does.
export const REVENUE_STATUSES: OrderStatus[] = [
  "PENDING",
  "PREPARING",
  "READY",
  "COMPLETED",
];

/// How an order was settled. A credit order posts a CHARGE to the staff
/// ledger; a cash order is paid at the counter and never touches it.
export const PAYMENT_METHODS = ["CASH", "CREDIT"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CREDIT: "Credit (on account)",
};

/// CHARGE and ADJUSTMENT increase what someone owes; PAYMENT reduces it.
/// CHARGE and PAYMENT are always stored positive. ADJUSTMENT may be negative,
/// which is how part of a balance gets written off.
export const LEDGER_TYPES = ["CHARGE", "PAYMENT", "ADJUSTMENT"] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export const LEDGER_LABELS: Record<LedgerType, string> = {
  CHARGE: "Order on credit",
  PAYMENT: "Payment received",
  ADJUSTMENT: "Adjustment",
};

/// +1 adds to the balance owed, -1 settles it.
export const LEDGER_SIGN: Record<LedgerType, 1 | -1> = {
  CHARGE: 1,
  PAYMENT: -1,
  ADJUSTMENT: 1,
};

export const EXPENSE_CATEGORIES = [
  "Supplies",
  "Rent",
  "Salaries",
  "Utilities",
  "Gas",
  "Maintenance",
  "Other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (
    typeof value === "string" &&
    (PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

export function isLedgerType(value: unknown): value is LedgerType {
  return (
    typeof value === "string" &&
    (LEDGER_TYPES as readonly string[]).includes(value)
  );
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}
