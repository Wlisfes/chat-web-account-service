export interface RoleIdentity {
    uid: string
}

export interface ResourceScopeRule {
    roleUid: string
    resourceCode: string
}

/** 每个角色的资源专属规则优先于星号默认规则，不允许两者在同一角色中叠加放大权限。 */
export function selectEffectiveScopeRules<TRule extends ResourceScopeRule>(
    roles: RoleIdentity[],
    scopes: TRule[],
    resourceCode: string,
    defaultResourceCode = '*'
): TRule[] {
    return roles.flatMap(role => {
        const roleScopes = scopes.filter(scope => scope.roleUid === role.uid)
        const exact = roleScopes.find(scope => scope.resourceCode === resourceCode)
        return exact ? [exact] : roleScopes.filter(scope => scope.resourceCode === defaultResourceCode)
    })
}
