import type { NextConfig } from "next";

/**
 * Label Lab talks to its API through the same origin it is served from, so
 * the browser never sees a cross-origin request and the session cookie set
 * by `/labelling/api/session` stays first-party. The API itself lives in a
 * separate service; point `AMP_LABEL_LAB_API_ORIGIN` at it.
 */
const DEFAULT_AMP_LABEL_LAB_API_ORIGIN =
    "https://amp-label-lab.anshulyemul.chatgpt.site";

const ampLabelLabApiOrigin = (
    process.env.AMP_LABEL_LAB_API_ORIGIN?.trim() ||
    DEFAULT_AMP_LABEL_LAB_API_ORIGIN
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
    async rewrites() {
        return [
            {
                source: "/labelling/api/:path*",
                destination: `${ampLabelLabApiOrigin}/api/:path*`,
            },
        ];
    },
    skipTrailingSlashRedirect: true,
};

export default nextConfig;
