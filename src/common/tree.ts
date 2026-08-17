export interface TreeNodeLike {
    uid: string
    parentUid?: string | null
    sort: number
}

export type TreeNode<TNode extends TreeNodeLike> = TNode & {
    children: TreeNode<TNode>[]
}

/** 将已经校验过父子关系的扁平节点组装为稳定排序的树。 */
export function buildTree<TNode extends TreeNodeLike>(nodes: TNode[]): TreeNode<TNode>[] {
    const byUid = new Map<string, TreeNode<TNode>>()
    const roots: TreeNode<TNode>[] = []

    for (const node of nodes) {
        byUid.set(node.uid, { ...node, children: [] })
    }

    for (const node of byUid.values()) {
        const parent = node.parentUid ? byUid.get(node.parentUid) : undefined
        if (parent) {
            parent.children.push(node)
        } else {
            roots.push(node)
        }
    }

    const sortNodes = (items: TreeNode<TNode>[]) => {
        items.sort((left, right) => left.sort - right.sort || left.uid.localeCompare(right.uid))
        items.forEach(item => sortNodes(item.children))
    }
    sortNodes(roots)
    return roots
}

/** 校验邻接表不存在缺失父节点和环。 */
export function assertValidTree(nodes: TreeNodeLike[], label: string): void {
    const byUid = new Map(nodes.map(node => [node.uid, node]))

    for (const node of nodes) {
        if (node.parentUid && !byUid.has(node.parentUid)) {
            throw new Error(`${label} ${node.uid} 的父节点 ${node.parentUid} 不存在`)
        }

        const visited = new Set<string>([node.uid])
        let current = node
        while (current.parentUid) {
            if (visited.has(current.parentUid)) {
                throw new Error(`${label}不能形成循环层级：${[...visited, current.parentUid].join(' -> ')}`)
            }
            visited.add(current.parentUid)
            const parent = byUid.get(current.parentUid)
            if (!parent) {
                break
            }
            current = parent
        }
    }
}
