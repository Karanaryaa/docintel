import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/binary and model-loading packages must be required from
  // node_modules at runtime, not bundled into the route chunk.
  serverExternalPackages: ["@napi-rs/canvas", "@huggingface/transformers", "unpdf"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
