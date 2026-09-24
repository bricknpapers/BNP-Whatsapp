import { ImageResponse } from "next/og";

// Replaces the default Next.js favicon with the Brick N Papers mark —
// the full logo from `public/brand/logo.png` (icon, wordmark, and TM
// mark), shown whole via `contain` rather than cropped to just the
// icon — an earlier cropped version read as the logo being cut off.
// The wordmark won't be legible at 32px, same as any wordmark at
// favicon size, but nothing is cropped out of frame. Tile is white,
// not the gold-700 brand color — the glyph's own line art is itself a
// gold gradient, so a gold tile behind it collapses the contrast.
// Matches BrandMark (src/components/brand-mark.tsx), the sidebar/
// auth-page logo.
//
// This route takes precedence over src/app/favicon.ico, which is the
// Next.js default and can stay on disk harmlessly (or be removed).

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  const logoData = await fetch(
    new URL("../../public/brand/logo.png", import.meta.url),
  ).then((res) => res.arrayBuffer());
  const logoBase64 = Buffer.from(logoData).toString("base64");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#FFFFFF", // --card (white) — see note above
          borderRadius: 6,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            margin: 3,
            backgroundImage: `url(data:image/png;base64,${logoBase64})`,
            backgroundSize: "contain",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
