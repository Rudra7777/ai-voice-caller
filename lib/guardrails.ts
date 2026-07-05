export type RedisLike = {
  get(key: string): Promise<string | null>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
}
type Deps = { redis: RedisLike }
type Args = { phone: string; ip: string; dailyCap: number }
type Result = { ok: true } | { ok: false; error: string }

const DAY = 60 * 60 * 24

export async function checkGuardrails({ redis }: Deps, { phone, ip, dailyCap }: Args): Promise<Result> {
  if ((await redis.get('killswitch')) === 'on') return { ok: false, error: 'killed' }

  const today = new Date().toISOString().slice(0, 10)
  const dailyKey = `calls:${today}`
  const dailyCount = Number((await redis.get(dailyKey)) ?? '0')
  if (dailyCount >= dailyCap) return { ok: false, error: 'daily_cap' }

  if (Number((await redis.get(`num:${phone}`)) ?? '0') >= 1)
    return { ok: false, error: 'number_rate_limited' }

  if (Number((await redis.get(`ip:${ip}`)) ?? '0') >= 3)
    return { ok: false, error: 'ip_rate_limited' }

  // All checks passed — record this call.
  const newDaily = await redis.incr(dailyKey)
  if (newDaily === 1) await redis.expire(dailyKey, DAY)
  const numCount = await redis.incr(`num:${phone}`)
  if (numCount === 1) await redis.expire(`num:${phone}`, DAY)
  const ipCount = await redis.incr(`ip:${ip}`)
  if (ipCount === 1) await redis.expire(`ip:${ip}`, DAY)
  return { ok: true }
}
