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
        if (await this.verifyEncoded(password, encodedHash)) {
            return true
        }

        /** 兼容历史管理端使用 btoa(encodeURIComponent(password)) 传输的登录请求。 */
        const legacyPassword = this.decodeLegacyClientPassword(password)
        return legacyPassword !== password && (await this.verifyEncoded(legacyPassword, encodedHash))
    }

    /** 使用当前 scrypt 参数校验密码摘要。 */
    private async verifyEncoded(password: string, encodedHash: string): Promise<boolean> {
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

    /** 严格还原历史客户端的 Base64 + encodeURIComponent 编码，不接受近似或非规范 Base64。 */
    private decodeLegacyClientPassword(password: string): string {
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(password)) {
            return password
        }

        try {
            const decodedUri = Buffer.from(password, 'base64').toString('utf8')
            if (Buffer.from(decodedUri, 'utf8').toString('base64') !== password) {
                return password
            }
            const decodedPassword = decodeURIComponent(decodedUri)
            return encodeURIComponent(decodedPassword) === decodedUri ? decodedPassword : password
        } catch {
            return password
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
