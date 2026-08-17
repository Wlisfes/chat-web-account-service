import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'

const ALGORITHM = 'scrypt-v1'
const KEY_LENGTH = 64
const DEFAULT_N = 16_384
const DEFAULT_R = 8
const DEFAULT_P = 1
const MAX_N = 65_536

@Injectable()
export class PasswordService {
    async hash(password: string): Promise<string> {
        const salt = randomBytes(16)
        const derivedKey = await this.derive(password, salt, DEFAULT_N, DEFAULT_R, DEFAULT_P)
        return [ALGORITHM, DEFAULT_N, DEFAULT_R, DEFAULT_P, salt.toString('base64url'), derivedKey.toString('base64url')].join('$')
    }

    async verify(password: string, encodedHash: string): Promise<boolean> {
        const [algorithm, nText, rText, pText, saltText, hashText, extra] = encodedHash.split('$')
        if (algorithm !== ALGORITHM || extra !== undefined || !saltText || !hashText) {
            return false
        }

        const n = Number(nText)
        const r = Number(rText)
        const p = Number(pText)
        if (
            !Number.isInteger(n) ||
            n < DEFAULT_N ||
            n > MAX_N ||
            !Number.isInteger(r) ||
            r < 1 ||
            r > 32 ||
            !Number.isInteger(p) ||
            p < 1 ||
            p > 8
        ) {
            return false
        }

        try {
            const salt = Buffer.from(saltText, 'base64url')
            const expected = Buffer.from(hashText, 'base64url')
            if (salt.length < 16 || expected.length !== KEY_LENGTH) {
                return false
            }
            const actual = await this.derive(password, salt, n, r, p)
            return timingSafeEqual(actual, expected)
        } catch {
            return false
        }
    }

    private derive(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            scryptCallback(password, salt, KEY_LENGTH, { N, r, p, maxmem: 128 * N * r + 1024 * 1024 }, (error, derivedKey) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve(derivedKey)
            })
        })
    }
}
