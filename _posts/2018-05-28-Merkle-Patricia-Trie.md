---
layout: post
category : Ethereum
tagline: "Supporting tagline"
tags : [MPT, Ethereum,  wiki]
---
{% include JB/setup %}

## 修订版Merkle Patricia Trie规范（也叫Merkle Patricia Tree）

Merkle Patricia trie(MPT)试图提供一个密码认证的数据结构，来用于存储所有的（键值对）绑定。尽管在本文中，我们将键和值限制为字符串（其他数据类型只需使用任意序列化格式即可消除此限制，如RLP编码）。它们是完全确定性的，这意味着具有相同键-值对绑定的Patricia Trie能够确保最后的值完全相同，也具有相同的root hash。MPT为插入、查找和删除提供O(log(n))的效率，而且比诸如红黑树这类更复杂的基于比较的方案更加容易理解和编码。

<!-- more -->

### 前言：Basic Radix Tries（基数树）

在basic radix trie中，每个节点可以看做是

	[i0, i1 ... in, value]

这里`i0 ...`表示字母的符号（通常是二进制或者十六进制），`value`是节点的终止值。`i0 ...`槽中的值一般为`NULL`或者是其他节点的指针（在我们的情况中是其他节点的hash值）。这形成一种基本的键值对存储。例如，如果你对trie中的值`dog`感兴趣，你首先将其转换为小写字母（`64 6f 67`），然后沿着trie路径下降，直到你读取到值为止。即，你首先在一个键值对数据库中找到trie的根节点，然后使用索引位置6处的值作为键得到下一层的节点（使用键查找键值对数据库），然后得到索引位置4的值作为键继续查找下一个值，直到你找到路径：`root->6->4->6->15->6->7`，你找到你想要的节点值，然后返回结果。

注意，在“trie”中查找与在键值对“数据库”中查找是不同的。虽然它们都是键值布局，但是数据库查找是传统的通过键一步完成查找，而在trie中通过键查找需要多次查询数据库以便找到最终的值。为消除歧义，我们将后者称为**路径**。

radix trie的更新与删除操作是非常简单的。可以大致定义如下：

```python
def update(node,path,value):
    if path == '':
        curnode = db.get(node) if node else [ NULL ] * 17
        newnode = curnode.copy()
        newnode[-1] = value
    else:
        curnode = db.get(node) if node else [ NULL ] * 17
        newnode = curnode.copy()
        newindex = update(curnode[path[0]],path[1:],value)
        newnode[path[0]] = newindex
    db.put(hash(newnode),newnode)
    return hash(newnode)

def delete(node,path):
    if node is NULL:
        return NULL
    else:
        curnode = db.get(node)
        newnode = curnode.copy()
        if path == '':
            newnode[-1] = NULL
        else:
            newindex = delete(curnode[path[0]],path[1:])
            newnode[path[0]] = newindex

        if len(filter(x -> x is not NULL, newnode)) == 0:
            return NULL
        else:
            db.put(hash(newnode),newnode)
            return hash(newnode)
```

radix trie中的“Merkle”部分造成的事实是：节点的确定性加密hash值作为指向该节点的指针（对于每个键值对数据库中的查找`key = sha3(rlp(value))`），而不是C语言实现的传统trie结构中的一些32-bit或者64-bit的内存位置（即指针）。这为数据结构提供了加密授权的形式。如果一个给定trie的根hash是公开的，那么任何人都能通过路径中每一步提供的节点来证明在特定路径上trie有给定的值。攻击者对不存在的（路径，值）对提供证明是不可能的，因为根hash是完全基于它下面所有节点的hash，因此任何的修改都会导致根hash的变化。

正如上述所言，每次遍历路径中的1 nibble时，大部分节点包含一个17个元素的数组。路径中的每个索引值都为一个16进制字符（即nibble，4bits，刚好是16进制全部字符），共16个索引，加上1个最终的目标值。这些17个元素的数组节点称为分支节点（branch node）。

### 核心规范：Merkle Patricia Trie

然而，radix trie有一个主要的限制：效率太低。如果你想存储仅仅一个（路径，值）对（例如在以太坊中的state trie），那么这个路径有64字符长（`byte32`中nibble数量），你将需要超过1kb的额外空间来存储一层中的每个字符，每次查找或者删除都需要花费全部的64步。Patricia树就是用来解决这个问题的。

#### 优化

Merkle Patricia trie通过给数据结构添加一些额外的复杂性来解决低效问题。Merkle Patricia trie中一个节点如下：

1. NULL（表示空字符串）
2. branch，分支节点，一个17个元素的节点`[v0 ... v15, vt]`
3. leaf，叶子节点，一个2个元素的节点`[encodedPath, value]`
4. extension，扩展节点，一个2个元素的节点`[encodedPath, key]`

对于64个字符的路径，当遍历最初几层后，不可避免地会到达没有发散路径的节点。要求节点除目标索引（路径中的下个nibble）外的每个索引（16进制字符）有空值是很naive的。可以通过设置扩展节点`[encodedPath, key]`的方式缩短下降深度。，这里`encodedPath`包含“部分路径”跳过（通过下面介绍的压缩编码），`key`用来查询数据库中的下个节点。

通过`encodedPath`中的第一个nibble的标志来决定叶子节点。叶子节点也通过“部分路径”跳过来完成剩余路径。叶子节点的`value`即为目标值。

上述优化有一些歧义。当在nibble中遍历路径时，可能会在奇数nibble时遍历结束。但所有的数据都以`byte`形式存储，这样就没法区分例如nibble 1和nibble 01这样的情况（都必须以`<01>`方式存储）。为表明奇数长度，部分路径会有标志前缀。

#### 说明：带可选终止符的16进制压缩编码

在上述描述的奇数与偶数长度以及叶子节点与扩展节点中，任何2个元素节点的部分路径的第一个nibble中包含有标志信息。如下表：

|hex char | bits | 节点类型 | 路径长度 |
|:---------:|------|---------|:---------:|
|0 | 0000 | 扩展节点 | 偶数 |
|1 | 0001 | 扩展节点 | 奇数 |
|2 | 0010 | 叶子节点 | 偶数 |
|3 | 0011 | 叶子节点 | 奇数 |

对于偶数剩余路径长度（0或者2），总是用0来填充另一个nibble。（即偶数的first nibble是flags，第二个nibble填充0，来和first nibble构成一个完整的byte。）

```python
def compact_encode(hexarray):
    term = 1 if hexarray[-1] == 16 else 0
    if term: hexarray = hexarray[:-1] #I think this line should not have if statement, directly using hexarray = hexarray[:-1] by example below.
    oddlen = len(hexarray) % 2
    flags = 2 * term + oddlen
    if oddlen:
        hexarray = [flags] + hexarray
    else:
        hexarray = [flags] + [0] + hexarray
    # hexarray now has an even length whose first nibble is the flags.
    o = ''
    for i in range(0,len(hexarray),2):
        o += chr(16 * hexarray[i] + hexarray[i+1])
    return o
```

例如：

```shell
> [ 1, 2, 3, 4, 5, ...]
'11 23 45'
> [ 0, 1, 2, 3, 4, 5, ...]
'00 01 23 45'
> [ 0, f, 1, c, b, 8, 10]
'20 0f 1c b8'
> [ f, 1, c, b, 8, 10]
'3f 1c b8'
```

这里是得到Merkle Patricia trie中一个节点的代码：

```python
def get_helper(node,path):
    if path == []: return node
    if node = '': return ''
    curnode = rlp.decode(node if len(node) < 32 else db.get(node))
    if len(curnode) == 2:
        (k2, v2) = curnode
        k2 = compact_decode(k2)
        if k2 == path[:len(k2)]:
            return get(v2, path[len(k2):])
        else:
            return ''
    elif len(curnode) == 17:
        return get_helper(curnode[path[0]],path[1:])

def get(node,path):
    path2 = []
    for i in range(len(path)):
        path2.push(int(ord(path[i]) / 16))
        path2.push(ord(path[i]) % 16)
    path2.push(16)
    return get_helper(node,path2)
```

#### Trie示例

假设一个trie包含4个路径/值对`('do', 'verb'), ('dog', 'puppy'), ('doge', 'coin'), ('horse', 'stallion')`。首先我们将路径与值都转换成`bytes`。为方便理解，路径的真实字节使用<>表示，值仍然显示为字符串，用''表示（实际上它们都是字节）：

```shell
<64 6f> : 'verb'
<64 6f 67> : 'puppy'
<64 6f 67 65> : 'coin'
<68 6f 72 73 65> : 'stallion'
```

现在我们可以在数据库中建立如下键值对trie树：

```shell
rootHash: [ <16>, hashA ]
hashA:    [ <>, <>, <>, <>, hashB, <>, <>, <>, hashC, <>, <>, <>, <>, <>, <>, <>, <> ]
hashC:    [ <20 6f 72 73 65>, 'stallion' ]
hashB:    [ <00 6f>, hashD ]
hashD:    [ <>, <>, <>, <>, <>, <>, hashE, <>, <>, <>, <>, <>, <>, <>, <>, <>, 'verb' ]
hashE:    [ <17>, hashF ]
hashF:    [ <>, <>, <>, <>, <>, <>, hashG, <>, <>, <>, <>, <>, <>, <>, <>, <>, 'puppy' ]
hashG:    [ <35>, 'coin' ]
```

当一个节点被另一个节点引用时，包含的值是`H(rlp.encode(x))`，这里`H(x) = sha3(x) if len(x) >= 32 else x`，`rlp.encode`是[RLP](https://github.com/ethereum/wiki/wiki/RLP)编码函数。注意，当更新trie树时，如果新创建的节点长度大于等于32，则需要将键值对`(sha3(x), x)`存储在持久性查找表中。如果节点长度小于32，则不需要存储任何东西，因为函数`f(x) = x`是可逆的。

#### 以太坊中的Trie树

以太坊中所有的Merkle trie均采用Merkle Patricia Trie。区块头中存在3种trie的根：

1. stateRoot
2. transactionsRoot
3. receiotsRoot

##### State Trie

全局状态trie，随时间更新。状态trie中，`path`总是`sha3(ethereumAddress)`，`value`总是`rlp(ethereumAccount)`。更具体地说，以太坊账户是一个包含`[nonce, balance, storageRoot, codeHash]`4个元素的数组。值得注意的是，`storageRoot`是另一个Patricia Trie的根。

##### Storage Trie

存储trie保存所有的合约数据。每个账户都有一个单独的存储trie。trie中的`path`有时很复杂，但它们都取决于[此](https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_getstorageat)

##### Transactions Trie

每个区块都有单独的交易trie。`path`是`rlp(transactionIndex)`。`transactionIndex`是所挖区块的索引。其顺序取决于矿工，因此直到区块被挖出前，数据都是未知的。当区块挖出后，交易trie永不更新。

##### Receipts Trie

每个区块有自己的收据trie。`path`是`rlp(transactionIndex)`。`transactionIndex`是所挖区块的索引。从不更新。

### 参考资料

原文链接：[Patricia Tree](https://github.com/ethereum/wiki/wiki/Patricia-Tree)
