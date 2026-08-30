import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets local verification use an isolated build directory while `next dev`
  // is already running. Railway keeps the standard `.next` directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // the dev overlay badge sits bottom-left by default, right on top of the
  // sidebar's Log out button — move it out of the way
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
