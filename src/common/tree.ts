export interface TreeNodeLike {
    keyId: number
    parentKeyId?: number | null
    sort: number
}

export type TreeNode<TNode extends TreeNodeLike> = TNode & {
    children: TreeNode<TNode>[]
}

/** 将已经校验过父子关系的扁平节点组装为稳定排序的树。 */
export function buildTree<TNode extends TreeNodeLike>(nodes: TNode[]): TreeNode<TNode>[] {
    const byKeyId = new Map<number, TreeNode<TNode>>()
    const roots: TreeNode<TNode>[] = []

    for (const node of nodes) {
        byKeyId.set(node.keyId, { ...node, children: [] })
    }

    for (const node of byKeyId.values()) {
        const parent = node.parentKeyId ? byKeyId.get(node.parentKeyId) : undefined
        if (parent) {
            parent.children.push(node)
        } else {
            roots.push(node)
        }
    }

    const sortNodes = (items: TreeNode<TNode>[]) => {
        items.sort((left, right) => left.sort - right.sort || left.keyId - right.keyId)
        items.forEach(item => sortNodes(item.children))
    }
    sortNodes(roots)
    return roots
}

/** 校验邻接表不存在缺失父节点和环。 */
export function assertValidTree(nodes: TreeNodeLike[], label: string): void {
    const byKeyId = new Map(nodes.map(node => [node.keyId, node]))

    for (const node of nodes) {
        if (node.parentKeyId && !byKeyId.has(node.parentKeyId)) {
            throw new Error(`${label} ${node.keyId} 的父节点 ${node.parentKeyId} 不存在`)
        }

        const visited = new Set<number>([node.keyId])
        let current = node
        while (current.parentKeyId) {
            if (visited.has(current.parentKeyId)) {
                throw new Error(`${label}不能形成循环层级：${[...visited, current.parentKeyId].join(' -> ')}`)
            }
            visited.add(current.parentKeyId)
            const parent = byKeyId.get(current.parentKeyId)
            if (!parent) {
                break
            }
            current = parent
        }
    }
}
