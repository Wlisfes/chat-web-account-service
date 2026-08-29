type NacosLoginResponse = {
    accessToken?: unknown
}

export async function getNacosAccessToken(baseUrl: string): Promise<string | undefined> {
    const username = process.env.NACOS_USERNAME?.trim()
    const password = process.env.NACOS_PASSWORD
    if (!username || password === undefined) {
        return undefined
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/nacos/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password })
    })
    if (!response.ok) {
        throw new Error(`Nacos 鉴权失败：HTTP ${response.status}`)
    }

    const result = (await response.json()) as NacosLoginResponse
    if (typeof result.accessToken !== 'string' || !result.accessToken.trim()) {
        throw new Error('Nacos 鉴权响应缺少 accessToken')
    }
    return result.accessToken
}

export function withNacosAccessToken(parameters: URLSearchParams, accessToken: string | undefined): URLSearchParams {
    if (accessToken) {
        parameters.set('accessToken', accessToken)
    }
    return parameters
}
