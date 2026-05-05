export function isAdminEmail(email) {
  if (typeof email !== "string" || !email) return false;
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(email.toLowerCase());
}
