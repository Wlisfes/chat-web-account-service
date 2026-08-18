import { randomUUID, timingSafeEqual } from 'node:crypto'
import { BadRequestException, Injectable } from '@nestjs/common'
import { create } from 'svg-captcha'
import { RedisService } from '@/modules/redis/redis.service'

export const AUTH_CAPTCHA_COOKIE = 'chat-web-account-captcha'

@Injectable()
export class CaptchaService {
    private readonly keyPrefix = 'chat-web:account:captcha'
    readonly expiresIn = 180

    constructor(private readonly redisService: RedisService) {}

    async create(inverse = false): Promise<{ sid: string; svg: string }> {
        const sid = randomUUID()
        const captcha = create({
            charPreset: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
            width: 120,
            height: 40,
            fontSize: 40,
            inverse,
            noise: 2
        })
        await this.redisService.setEx(this.getKey(sid), this.expiresIn, captcha.text.toUpperCase())
        return { sid, svg: captcha.data }
    }

    async verify(sid: string | undefined, input: string): Promise<void> {
        if (!sid) {
            throw new BadRequestException('验证码不存在或已过期')
        }
        const expected = await this.redisService.getDel(this.getKey(sid))
        const actual = input.trim().toUpperCase()
        if (!expected || expected.length !== actual.length) {
            throw new BadRequestException('验证码错误或已过期')
        }
        const expectedBuffer = Buffer.from(expected)
        const actualBuffer = Buffer.from(actual)
        if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
            throw new BadRequestException('验证码错误或已过期')
        }
    }

    private getKey(sid: string): string {
        return `${this.keyPrefix}:${sid}`
    }
}
