import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The full Brick N Papers logo (public/brand/logo.png) — the gold
 * scroll-on-brick icon, the "BRICK N PAPERS" wordmark, and the TM
 * mark, shown whole. An earlier version cropped this down to just the
 * icon for UI-chrome sizes; that read as the logo being cut off, so
 * this renders the complete file instead (object-contain, no crop,
 * no background tile — the asset carries its own framing). Size by
 * height only (`h-*`) and let width follow the source's own aspect
 * ratio (831:758) rather than forcing a square box.
 */
export function BrandMark({
  className,
  height = 40,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <Image
      src="/brand/logo.png"
      alt="Brick N Papers"
      width={831}
      height={758}
      className={cn("h-auto w-auto shrink-0 object-contain", className)}
      style={{ height, width: "auto" }}
      priority
    />
  );
}
