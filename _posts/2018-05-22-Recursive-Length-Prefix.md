---
layout: post
category : Ethereum
tagline: "Supporting tagline"
tags : [RLP, Ethereum,  wiki]
---
{% include JB/setup %}

## RLP

RLP（递归长度前缀编码）的目的是用来编码二进制数据的任意嵌套数组。RLP是以太坊中用来序列化对象的主要编码方式。RLP的唯一目的就是用来编码结构体；编码特殊数据类型（如字符串，浮点数）留给高层协议；RLP编码数据必须被解释成无前导零的大端字节序二进制格式（这使得整数0与空字节数组是等价的）。带有前导零的数在Deserialise时被视为无效。字符串长度也必须按照这种方式编码。

如果想要使用RLP编码字典，推荐两种规范的编码格式：一是使用key的字典序来组织`[[k1,v1], [k2,v2]...]`，二是采用以太坊使用的[Patricia Tree](https://github.com/ethereum/wiki/wiki/Patricia-Tree)编码。

### 定义

RLP编码只处理两类数据，它们是：

- 字符串（即字节数组）
- 列表

举个例子，一个空字符串，包含有"cat"的字符串，包换任意字符串的列表，以及更复杂的数据结构，如`["cat",["puppy","cow"],"horse",[[]],"pig",[""],"sheep"]`。注意在后文中，"字符串"将作为"二进制数据字节集合"的同义词。没有使用特殊的编码，没有关于字符串的知识被提及。

RLP编码规则如下：

- 对于值在`[0x00, 0x7f]`间的单个字节，RLP编码即为它自己的字节。
- 如果字符串是0-55字节长度，字符串RLP编码则包含一个__0x80__加上字符串长度的值，然后加上字符串。因此，第一个字节的范围是`[0x80, 0xb7]`。
- 如果字符串长度超过55字节，则字符串RLP编码首字节为__0xb7__加上字符串长度的长度，然后加上字符串长度，再加上字符串。例如，一个1024长度的字符串被编码为`\xb9\x04\x00`加上字符串。因此，第一个字节的范围是`[0xb8, 0xbf]`。
- 如果一个列表中所有元素之和长度是0-55字节，则RLP编码首字节为__0xc0__加上列表的长度，然后加上列表中各元素的RLP编码。因此，第一个字节的范围是`[0xc0, 0xf7]`。
- 如果列表长度超过55字节，则RLP编码首字节为__0xf7__加上列表中各元素长度的长度，然后加上列表各元素长度，再加上列表各元素RLP编码。因此，第一个字节的范围是`[0xf8, 0xff]`。

用代码表示为：

```python
def rlp_encode(input):
    if isinstance(input,str):
        if len(input) == 1 and ord(input) < 0x80: return input
        else: return encode_length(len(input), 0x80) + input
    elif isinstance(input,list):
        output = ''
        for item in input: output += rlp_encode(item)
        return encode_length(len(output), 0xc0) + output

def encode_length(L,offset):
    if L < 56:
         return chr(L + offset)
    elif L < 256**8:
         BL = to_binary(L)
         return chr(len(BL) + offset + 55) + BL
    else:
         raise Exception("input too long")

def to_binary(x):
    if x == 0:
        return ''
    else: 
        return to_binary(int(x / 256)) + chr(x % 256)

```

### RLP编码示例

字符串"dog" = `[0x83, 'd', 'o', 'g']`

列表["cat", "dog"] = `[0xc8, 0x83, 'c', 'a', 't', 0x83, 'd', 'o', 'g']`

空字符串("null") = `[0x80]`

空列表 = `[0xc0]`

整数0 = `[0x80]`

编码的整数0("\x00") = `[0x00]`

编码的整数15("\x0f") = `[0x0f]`

编码的整数1024("\x04\x00") = `[0x82, 0x04, 0x00]`

3的[集合论定义](http://en.wikipedia.org/wiki/Set-theoretic_definition_of_natural_numbers)——`[ [], [[]], [ [], [[]] ] ] = [ 0xc7, 0xc0, 0xc1, 0xc0, 0xc3, 0xc0, 0xc1, 0xc0 ]`

字符串""Lorem ipsum dolor sit amet, consectetur adipisicing elit" = `[ 0xb8, 0x38, 'L', 'o', 'r', 'e', 'm', ' ', ... , 'e', 'l', 'i', 't' ]`

### RLP解码

根据RLP编码的规则与处理过程，RLP解码的输入应该看做是二进制数据数组，处理过程如下：

1. 根据输入数据的第一个字节（即前缀），解码数据类型，真实数据的长度与偏移；
2. 根据数据类型与偏移，解码相关的数据；
3. 继续解码剩余的输入部分；

解码数据类型与偏移的规则如下：

1. 数据为字符串，如果第一个字节位于`[0x00, 0x7f]`间，则字符串为第一个字节自身；
2. 数据为字符串，如果第一个字节位于`[0x80, 0xb7]`间，则字符串为第一个字节后的字串，且长度等于第一个字节减去0x80。
3. 数据为字符串，如果第一个字节位于`[0xb8, 0xbf]`间，则字符串长度跟随在第一个字节后，且为第一个字节减去0xb7，字符串则跟随在字符串长度之后。
4. 数据为列表，它的第一个字节范围为`[0xc0, 0xf7]`间，则列表所有元素RLP编码紧随第一个字节之后，其RLP编码的长度（payload）等于第一个字节减去0xc0。
5. 数据为列表，它的第一个字节范围为`[0xf8, 0xff]`间，则列表所有元素payload的长度跟随在第一个字节后，且等于第一个字节减去0xf7，列表所有元素的RLP编码则跟随在列表总payload之后。

用代码表示为：

```python
def rlp_decode(input):
    if len(input) == 0:
        return
    output = ''
    (offset, dataLen, type) = decode_length(input)
    if type is str:
        output = instantiate_str(substr(input, offset, dataLen))
    elif type is list:
        output = instantiate_list(substr(input, offset, dataLen))
    output + rlp_decode(substr(input, offset + dataLen))
    return output

def decode_length(input):
    length = len(input)
    if length == 0:
        raise Exception("input is null")
    prefix = ord(input[0])
    if prefix <= 0x7f:
        return (0, 1, str)
    elif prefix <= 0xb7 and length > prefix - 0x80:
        strLen = prefix - 0x80
        return (1, strLen, str)
    elif prefix <= 0xbf and length > prefix - 0xb7 and length > prefix - 0xb7 + to_integer(substr(input, 1, prefix - 0xb7)):
        lenOfStrLen = prefix - 0xb7
        strLen = to_integer(substr(input, 1, lenOfStrLen))
        return (1 + lenOfStrLen, strLen, str)
    elif prefix <= 0xf7 and length > prefix - 0xc0:
        listLen = prefix - 0xc0;
        return (1, listLen, list)
    elif prefix <= 0xff and length > prefix - 0xf7 and length > prefix - 0xf7 + to_integer(substr(input, 1, prefix - 0xf7)):
        lenOfListLen = prefix - 0xf7
        listLen = to_integer(substr(input, 1, lenOfListLen))
        return (1 + lenOfListLen, listLen, list)
    else:
        raise Exception("input don't conform RLP encoding form")

def to_integer(b):
    length = len(b)
    if length == 0:
        raise Exception("input is null")
    elif length == 1:
        return ord(b[0])
    else:
        return ord(substr(b, -1)) + to_integer(substr(b, 0, -1)) * 256
```
