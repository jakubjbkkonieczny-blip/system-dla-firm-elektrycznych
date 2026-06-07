type Props = {
  title: string;
  description?: string;
  children: React.ReactNode;
  variant?: "default" | "danger";
  badge?: React.ReactNode;
};

export function SettingsSection({
  title,
  description,
  children,
  variant = "default",
  badge,
}: Props) {
  return (
    <section
      className={[
        "theme-glass rounded-2xl border p-6 space-y-4 shadow-sm",
        variant === "danger"
          ? "bg-card border-danger-border"
          : "bg-card border-border",
      ].join(" ")}
      style={{ boxShadow: "var(--shadow)" }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2
            className={[
              "text-lg font-semibold",
              variant === "danger" ? "text-danger" : "text-text",
            ].join(" ")}
          >
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-text-muted mt-1">{description}</p>
          ) : null}
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}
