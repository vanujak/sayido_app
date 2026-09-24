export interface CoupleNameVisitor {
  visitor_fname?: string | null;
  visitor_lname?: string | null;
  partner_fname?: string | null;
  partner_lname?: string | null;
}

/**
 * Formats couple/user name according to:
 * 1. Both partners' first names present -> "1st partner's first name & 2nd partner's first name" (e.g. "Kasun & Nisansala")
 * 2. Only partner 1 present -> "Kasun" (or "Kasun Silva" if last name exists)
 * 3. Only partner 2 present -> "Nisansala"
 * 4. Neither present -> fallback (default "Couple")
 */
export function formatCoupleName(
  visitor?: CoupleNameVisitor | null,
  fallback: string = "Couple"
): string {
  if (!visitor) return fallback;

  const rawP1 = (visitor.visitor_fname || "").trim();
  const rawP2 = (visitor.partner_fname || "").trim();

  // Filter out placeholder "Visitor"
  const p1 = rawP1 && rawP1.toLowerCase() !== "visitor" ? rawP1 : "";
  const p2 = rawP2 && rawP2.toLowerCase() !== "visitor" ? rawP2 : "";

  // If both partners' first names are provided
  if (p1 && p2) {
    return `${p1} & ${p2}`;
  }

  // If only partner 1 is provided
  if (p1) {
    const l1 = (visitor.visitor_lname || "").trim();
    return l1 ? `${p1} ${l1}` : p1;
  }

  // If only partner 2 is provided
  if (p2) {
    const l2 = (visitor.partner_lname || "").trim();
    return l2 ? `${p2} ${l2}` : p2;
  }

  return fallback;
}
