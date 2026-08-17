export interface EffectiveDataScope {
    all: boolean
    includeSelf: boolean
    organizationUids: string[]
}

export interface EffectiveAccess {
    superAdmin: boolean
    roleCodes: string[]
    permissionCodes: string[]
    menuTree: unknown[]
}
