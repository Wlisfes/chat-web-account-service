const { PasswordService } = require('@wlisfes/chat-web-base-schema/auth')

function readFromPipe() {
    return new Promise((resolve, reject) => {
        let value = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', chunk => {
            value += chunk
        })
        process.stdin.on('end', () => resolve(value.replace(/[\r\n]+$/, '')))
        process.stdin.on('error', reject)
    })
}

function readHiddenFromTerminal() {
    return new Promise((resolve, reject) => {
        let value = ''
        const stdin = process.stdin
        process.stderr.write('Password: ')
        stdin.setRawMode(true)
        stdin.resume()
        stdin.setEncoding('utf8')

        const cleanup = () => {
            stdin.setRawMode(false)
            stdin.pause()
            stdin.removeListener('data', onData)
            process.stderr.write('\n')
        }
        const onData = chunk => {
            for (const character of chunk) {
                if (character === '\u0003') {
                    cleanup()
                    reject(new Error('Canceled'))
                    return
                }
                if (character === '\r' || character === '\n') {
                    cleanup()
                    resolve(value)
                    return
                }
                if (character === '\u007f' || character === '\b') {
                    value = value.slice(0, -1)
                    continue
                }
                value += character
            }
        }
        stdin.on('data', onData)
    })
}

async function main() {
    const password = process.stdin.isTTY ? await readHiddenFromTerminal() : await readFromPipe()
    if (password.length < 6 || password.length > 128) {
        throw new Error('密码长度必须保持6~128位。')
    }
    const hash = await new PasswordService().hash(password)
    process.stdout.write(`${hash}\n`)
}

main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
})
