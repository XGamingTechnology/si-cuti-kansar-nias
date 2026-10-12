import type { PreviewRole } from "@/lib/prototype-data";

export function PreviewSwitcher({
  value,
  onChange,
  compact = false,
}: {
  value: PreviewRole;
  onChange: (role: PreviewRole) => void;
  compact?: boolean;
}) {
  return (
    <nav
      className={`preview-switcher ${compact ? "compact" : ""}`}
      aria-label="Pilih tampilan prototype"
    >
      <span>Mode pratinjau</span>
      <div>
        {(["login", "admin", "employee"] as const).map((role) => (
          <button
            key={role}
            className={value === role ? "active" : ""}
            onClick={() => onChange(role)}
          >
            {role === "login"
              ? "Login"
              : role === "admin"
                ? "Admin"
                : "Pegawai"}
          </button>
        ))}
      </div>
    </nav>
  );
}
