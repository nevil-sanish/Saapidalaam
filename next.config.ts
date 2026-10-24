import type { NextConfig } from "next";
// Photo upload (≤2MB) goes through a server action; default body limit is 1MB.
const config: NextConfig = { experimental: { serverActions: { bodySizeLimit: "3mb" } } };
export default config;
