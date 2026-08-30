import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the dev overlay badge sits bottom-left by default, right on top of the
  // sidebar's Log out button — move it out of the way
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
