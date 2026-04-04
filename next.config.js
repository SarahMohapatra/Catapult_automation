/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow vscode.dev in iframes when NEXT_PUBLIC_VSCODE_REPO is set
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
