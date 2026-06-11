import Image from "next/image";
import Link from "next/link";
import { APP_BRANDING, LOGO_BRANDING } from "@/lib/branding";

/** Container px → image px (~80% fill, overflow clips PNG safe-zone). */
const BRAND_MARK_SIZES = {
  xs: { container: 44, image: 36 },
  sm: { container: 52, image: 42 },
  md: { container: 60, image: 50 },
} as const;

type BrandMarkSize = keyof typeof BRAND_MARK_SIZES;

const BRAND_MARK_CONTAINER_CLASS = [
  "relative shrink-0 flex items-center justify-center overflow-hidden",
  "rounded-[18px]",
  "border border-accent/20",
  "bg-[#0c1528]",
  "shadow-[0_0_0_1px_rgba(56,189,248,0.1),0_0_20px_rgba(56,189,248,0.12),0_4px_18px_rgba(0,0,0,0.35)]",
].join(" ");

export function AppLogoMark({
  size = "md",
  className = "",
}: {
  size?: BrandMarkSize;
  className?: string;
}) {
  const { container, image } = BRAND_MARK_SIZES[size];

  return (
    <span
      className={[BRAND_MARK_CONTAINER_CLASS, className].filter(Boolean).join(" ")}
      style={{ width: container, height: container }}
      aria-hidden
    >
      <Image
        src={LOGO_BRANDING.icon512Path}
        alt=""
        width={image}
        height={image}
        className="object-contain"
        draggable={false}
        priority={size === "md"}
      />
    </span>
  );
}

export function AppLogo({
  href = "/",
  size = "md",
  labelClassName = "font-semibold text-white tracking-tight",
}: {
  href?: string;
  size?: BrandMarkSize;
  labelClassName?: string;
}) {
  const labelSizeClass = size === "md" ? "text-xl" : "text-lg";

  return (
    <Link href={href} className="inline-flex items-center gap-3 shrink-0">
      <AppLogoMark size={size} />
      <span className={[labelSizeClass, labelClassName].join(" ")}>
        {APP_BRANDING.name}
      </span>
    </Link>
  );
}
