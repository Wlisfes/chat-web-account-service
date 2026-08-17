import { randomBytes } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'

const MAX_SIGNED_63_BIT = (1n << 63n) - 1n

/** 生成不超过19位的正整数业务UID，避免多实例依赖同一个自增序列。 */
export function generateUid(): string {
    let value = randomBytes(8).readBigUInt64BE() & MAX_SIGNED_63_BIT
    if (value === 0n) {
        value = 1n
    }
    return value.toString()
}

export function assertUid(value: string, label = 'UID'): string {
    if (!/^\d{1,19}$/.test(value)) {
        throw new BadRequestException(`${label}必须是1-19位数字字符串`)
    }
    return value
}
