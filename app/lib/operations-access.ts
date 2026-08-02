export const canAccessOperations = (role: string) =>
  role === "owner" || role === "admin";
