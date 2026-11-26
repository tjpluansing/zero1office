import type { Catalog, Override, Permission } from "./types";

/**
 * Mirrors public.effective_permissions() in the database so the matrix can
 * preview the result. The database copy is the one that is enforced.
 */
export function computeEffective(
  catalog: Catalog,
  roleId: string,
  overrides: Override[],
): Set<string> {
  const role = catalog.roles.find((r) => r.id === roleId);
  if (role?.is_super) return new Set(catalog.permissions.map((p) => p.key));
  const set = new Set(catalog.rolePermissions[roleId] ?? []);
  for (const o of overrides) if (o.effect === "grant") set.add(o.permission_key);
  for (const o of overrides) if (o.effect === "deny") set.delete(o.permission_key);
  return dropOrphanActions(catalog.permissions, set);
}

/** An action is meaningless without access to its page. */
export function dropOrphanActions(perms: Permission[], set: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const p of perms) {
    if (!set.has(p.key)) continue;
    if (p.action === "view" || set.has(`${p.page}.view`)) out.add(p.key);
  }
  return out;
}

/** Turn a desired effective set into the overrides needed on top of a role. */
export function diffToOverrides(catalog: Catalog, roleId: string, desired: Set<string>): Override[] {
  const role = catalog.roles.find((r) => r.id === roleId);
  if (role?.is_super) return [];
  const base = dropOrphanActions(catalog.permissions, new Set(catalog.rolePermissions[roleId] ?? []));
  const out: Override[] = [];
  for (const p of catalog.permissions) {
    const want = desired.has(p.key);
    const has = base.has(p.key);
    if (want && !has) out.push({ permission_key: p.key, effect: "grant" });
    if (!want && has) out.push({ permission_key: p.key, effect: "deny" });
  }
  return out;
}

export interface PageGroup {
  page: string;
  label: string;
  perms: Permission[];
}

export function groupByPage(perms: Permission[]): PageGroup[] {
  const map = new Map<string, PageGroup>();
  for (const p of [...perms].sort((a, b) => a.sort - b.sort)) {
    const g = map.get(p.page) ?? { page: p.page, label: p.page_label, perms: [] };
    g.perms.push(p);
    map.set(p.page, g);
  }
  return [...map.values()];
}
