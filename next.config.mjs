/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // transformers.js runs in the browser (Whisper worker); keep its Node-only deps out of the bundle.
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },
  async headers() {
    // Cross-origin isolation lets the in-browser models (Whisper, Kokoro) use multithreaded WebAssembly.
    // "credentialless" keeps CDN assets (Monaco, model weights) loadable without special headers.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
