import Image from "next/image";
import Link from "next/link";
import { APP_BRANDING, LOGO_BRANDING } from "@/lib/branding";

/** Circular brand mark — master: public/icon-512.png */
const BRAND_MARK_PX = {
  xs: 40,
  sm: 48,
  md: 56,
} as const;

type BrandMarkSize = keyof typeof BRAND_MARK_PX;

export function AppLogoMark({
  size = "md",
  className = "",
}: {
  size?: BrandMarkSize;
  className?: string;
}) {
  const px = BRAND_MARK_PX[size];

  return (
    <span
      className={["relative shrink-0 overflow-hidden rounded-full", className]
        .filter(Boolean)
        .join(" ")}
      style={{ width: px, height: px }}
      aria-hidden
    >
      <Image
        src={LOGO_BRANDING.icon512Path}
        alt=""
        fill
        sizes={`${px}px`}
        className="object-cover"
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
