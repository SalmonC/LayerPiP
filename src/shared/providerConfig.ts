const providerConfig = {
  'bilibili-video': [
    /https:\/\/www.bilibili.com\/video\/.*/,
    /https:\/\/www.bilibili.com\/list\/.*/,
    /https:\/\/www.bilibili.com\/bangumi\/.*/,
  ],
  'bilibili-live': [/https:\/\/live.bilibili.com\/.*/],
} as const

export default providerConfig

export type ProviderKey = keyof typeof providerConfig | 'common'

export function getProviderConfig(url: string): ProviderKey {
  return (
    (Object.entries(providerConfig).find(([, value]) =>
      value.some((reg) => reg.test(url)),
    )?.[0] as keyof typeof providerConfig | undefined) ?? 'common'
  )
}
