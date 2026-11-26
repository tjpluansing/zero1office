import { Check, Minus, RotateCcw } from "lucide-react";
import { dropOrphanActions, groupByPage } from "../lib/permissions";
import { ACTIONS, type Catalog } from "../lib/types";
import { Button, Toggle, cx } from "./ui";

interface Props {
  catalog: Catalog;
  roleId: string;
  /** The effective permissions being edited. */
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Permissions the current admin may hand out (anti-escalation). null = all. */
  grantable: Set<string> | null;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Two levels: the switch on each row is page access (<page>.view); the
 * boxes are the actions inside that page. Cells that differ from the
 * role preset get a gold marker and are saved as per-user overrides.
 */
export default function PermissionsMatrix({ catalog, roleId, value, onChange, grantable, disabled, disabledReason }: Props) {
  const role = catalog.roles.find((r) => r.id === roleId);
  const isSuper = !!role?.is_super;
  const base = dropOrphanActions(catalog.permissions, new Set(catalog.rolePermissions[roleId] ?? []));
  const groups = groupByPage(catalog.permissions);
  const locked = disabled || isSuper;
  const shown = isSuper ? new Set(catalog.permissions.map((p) => p.key)) : value;
  const customCount = isSuper ? 0 : catalog.permissions.filter((p) => base.has(p.key) !== value.has(p.key)).length;

  const set = (key: string, on: boolean) => {
    const next = new Set(value);
    const [page, action] = key.split(".");
    if (on) {
      next.add(key);
      if (action !== "view") next.add(`${page}.view`);
    } else {
      next.delete(key);
      if (action === "view") for (const p of catalog.permissions) if (p.page === page) next.delete(p.key);
    }
    onChange(dropOrphanActions(catalog.permissions, next));
  };
  const canGrant = (key: string) => grantable === null || grantable.has(key) || value.has(key);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-600">
          {isSuper ? (
            <span>Super Admins always have every permission.</span>
          ) : customCount > 0 ? (
            <span><span className="font-medium text-[#8a6416]">{customCount} custom</span> change{customCount === 1 ? "" : "s"} from the {role?.name} preset.</span>
          ) : (
            <span>Matches the <b>{role?.name}</b> preset.</span>
          )}
          {disabled && disabledReason && <span className="ml-1 text-slate-500">{disabledReason}</span>}
        </div>
        {!locked && (
          <div className="flex gap-2">
            <Button variant="ghost" type="button" className="!px-2 !py-1 text-xs" onClick={() => onChange(new Set(base))} disabled={customCount === 0}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset to preset
            </Button>
            <Button variant="ghost" type="button" className="!px-2 !py-1 text-xs" onClick={() => onChange(new Set())}>Clear all</Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Page</th>
              <th className="px-2 py-2.5 text-center font-semibold">Access</th>
              {ACTIONS.filter((a) => a.id !== "view").map((a) => (
                <th key={a.id} className="px-2 py-2.5 text-center font-semibold">{a.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {groups.map((g) => {
              const viewKey = `${g.page}.view`;
              const pageOn = shown.has(viewKey);
              const viewCustom = !isSuper && base.has(viewKey) !== value.has(viewKey);
              return (
                <tr key={g.page} className={cx(!pageOn && "bg-slate-50/60")}>
                  <td className="px-4 py-2.5">
                    <div className={cx("font-medium", pageOn ? "text-ink" : "text-slate-400")}>{g.label}</div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-center"><span className="relative inline-flex">
                      <Toggle label={`${g.label} page access`} checked={pageOn}
                        disabled={locked || (!pageOn && !canGrant(viewKey))} onChange={(v) => set(viewKey, v)} />
                      {viewCustom && <CustomDot />}
                    </span></div>
                  </td>
                  {ACTIONS.filter((a) => a.id !== "view").map((a) => {
                    const p = g.perms.find((x) => x.action === a.id);
                    if (!p) return <td key={a.id} className="px-2 py-2.5 text-center text-slate-300"><Minus className="mx-auto h-3.5 w-3.5" /></td>;
                    const on = shown.has(p.key);
                    const custom = !isSuper && base.has(p.key) !== value.has(p.key);
                    const blocked = locked || !pageOn || (!on && !canGrant(p.key));
                    return (
                      <td key={a.id} className="px-2 py-2.5">
                        <div className="flex justify-center"><span className="relative inline-flex">
                          <button type="button" role="checkbox" aria-checked={on} aria-label={`${g.label}: ${a.label}`}
                            title={p.description} disabled={blocked} onClick={() => set(p.key, !on)}
                            className={cx("grid h-5 w-5 place-items-center rounded border transition",
                              on ? "border-navy bg-navy text-white" : "border-slate-300 bg-white",
                              blocked ? "cursor-not-allowed opacity-40" : "hover:border-navy")}>
                            {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                          </button>
                          {custom && <CustomDot />}
                        </span></div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
        <span className="inline-block h-2 w-2 rounded-full bg-gold" /> differs from the role preset. Turning a page off hides it from the menu and blocks it on the server.
      </p>
    </div>
  );
}

function CustomDot() {
  return <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-gold ring-2 ring-white" title="Custom for this user" />;
}
