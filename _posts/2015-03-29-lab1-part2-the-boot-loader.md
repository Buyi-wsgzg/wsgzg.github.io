---
layout: post
category : OS
tagline: "Supporting tagline"
tags : [JOS, lab]
---
{% include JB/setup %}

### Boot Loader

软盘和硬盘划分每512字节为一个扇区（sector）。扇区是磁盘的最小传输单元：每次的读/写操作区域必须是以扇区对齐的整数个扇区。如果磁盘是可启动的，则第一个扇区称为启动扇区（boot sector），里面存储着boot loader的代码。当BIOS找到可启动软盘或硬盘时，它加载启动扇区的512字节到内存地址0x7c00至0xdff中，然后使用`jmp`指令设置CS:IP跳转到0000:7c00，再将控制权交给boot loader。类似BIOS的加载地址，这些地址都是可选的——但是，对于PC来说，这些加载地址都成为了默认的标准。
实验中采用硬盘启动机制，这意味着我们的boot loader必须小于512字节，boot loader包括一个汇编源文件`boot/boot.S`和一个C源文件`boot/main.c`。boot loader必须具备两个主要功能：

- boot loader将处理器从实模式切换至32-bit保护模式，只有在保护模式下，软件才能访问1MB以上的物理地址空间。
- boot loader通过x86的特殊I/O指令将kernel从硬盘读入内存中。

<!-- more -->

`boot.S`中首先关中断，然后打开A20地址线，设置cr0寄存器，再通过跳转指令转到32-bit保护模式代码处执行。

- 关中断

	```gas
	cli
	```

- 打开A20地址线

	```gas
	seta20.1:
		inb     $0x64,%al               # Wait for not busy
		testb   $0x2,%al
		jnz     seta20.1
		
		movb    $0xd1,%al               # 0xd1 -> port 0x64
		outb    %al,$0x64
		
	seta20.2:
		inb     $0x64,%al               # Wait for not busy
		testb   $0x2,%al
		jnz     seta20.2
		
		movb    $0xdf,%al               # 0xdf -> port 0x60
		outb    %al,$0x60
	```

- 设置cr0寄存器（cr0寄存器的第0位，即保护模式位）

	```gas
	movl    %cr0, %eax
	orl     $CR0_PE_ON, %eax
	movl    %eax, %cr0
	```

- 跳转至32-bit保护模式

	```gas
	ljmp    $PROT_MODE_CSEG, $protcseg
	```

`main.c`中首先通过`readseg()`函数读取一页（4KB）大小的kernel镜像到内存地址0x10000处，然后判断读入的kernel镜像是否是标准的elf文件，再通过`readseg()`函数将elf文件的每个程序段读入内存中，最后通过elf文件的`e_entry`保存的kernel入口地址（即kernel的链接地址）进入kernel执行。

- 读取一页kernel镜像

	```c
	readseg((uint32_t) ELFHDR, SECTSIZE*8, 0);
	```

- 判断elf文件是否有效

	```c
	if (ELFHDR->e_magic != ELF_MAGIC)
		goto bad;
	```

- 读取每个程序段

	```c
	for (; ph < eph; ph++)
		// p_pa is the load address of this segment (as well
		// as the physical address)
		readseg(ph->p_pa, ph->p_memsz, ph->p_offset);
	```
- 跳转至kernel入口地址

	```c
	((void (*)(void)) (ELFHDR->e_entry))();
	```

通过命令`objdump -f obj/kern/kernel`可以知道kernel的入口地址是**0x001000c**：

```objdump
wsgzg@wsgzg-VirtualBox:~/6.828/lab$ objdump -f obj/kern/kernel

obj/kern/kernel:     file format elf32-i386
architecture: i386, flags 0x00000112:
EXEC_P, HAS_SYMS, D_PAGED
start address 0x0010000c
```

### Kernel加载

为了理解`boot/main.c`文件，我们需要知道ELF文件格式。ELF是一种二进制文件，全称是“Executable and Linkable Format”，如`obj/kern/kernel`就是ELF格式的二进制镜像文件。ELF文件以一个固定长度的ELF头（ELF header）开始，后面紧接着一个变长的程序头（program header），这个程序头列举了所有将要被载入的程序段（program section），每个程序段都是连续的代码块或数据块，ELF文件格式的C语言定义在`inc/elf.h`中。通过`objdump`或者`i386-jos-elf-objdump`命令可以查看kernel镜像的段信息：

```objdump
wsgzg@wsgzg-VirtualBox:~/6.828/lab$ objdump -h obj/kern/kernel

obj/kern/kernel:     file format elf32-i386

Sections:
	Idx Name          Size      VMA       LMA       File off  Algn
	0 .text         00001907  f0100000  00100000  00001000  2**4
              CONTENTS, ALLOC, LOAD, READONLY, CODE
	1 .rodata       00000730  f0101920  00101920  00002920  2**5
              CONTENTS, ALLOC, LOAD, READONLY, DATA
	2 .stab         00003871  f0102050  00102050  00003050  2**2
              CONTENTS, ALLOC, LOAD, READONLY, DATA
	3 .stabstr      000018ba  f01058c1  001058c1  000068c1  2**0
              CONTENTS, ALLOC, LOAD, READONLY, DATA
	4 .data         0000a300  f0108000  00108000  00009000  2**12
              CONTENTS, ALLOC, LOAD, DATA
	5 .bss          00000644  f0112300  00112300  00013300  2**5
              ALLOC
	6 .comment      00000024  00000000  00000000  00013300  2**0
              CONTENTS, READONLY
```

我们主要关心下列程序段：

- .text：代码段，存放可执行的程序指令。
- .rodata：只读数据段，存放像ASCII字符串常量的数据。
- .data：数据段，存放程序的初始化数据，像带有初始化声明的全局变量。
- .bss：存放未初始化的全局变量，C语言要求未初始化的全局变量初始化为0，因此bss段中不存放任何内容，仅仅存放bss段的地址和大小。

特别注意**“VMA”**（链接地址）和**“LMA”**（加载地址）的区别。加载地址（load address）是程序段在加载时被载入到内存中的内存地址，而链接地址（link address）是程序段期望开始执行的内存地址。
通常链接地址与加载地址是相同的，如boot loader的text段：

```objdump
wsgzg@wsgzg-VirtualBox:~/6.828/lab$ objdump -h obj/boot/boot.out 

obj/boot/boot.out:     file format elf32-i386

Sections:
	Idx Name          Size      VMA       LMA       File off  Algn
	0 .text         0000017c  00007c00  00007c00  00000074  2**2
              CONTENTS, ALLOC, LOAD, CODE
	1 .eh_frame     000000b0  00007d7c  00007d7c  000001f0  2**2
              CONTENTS, ALLOC, LOAD, READONLY, DATA
	2 .stab         000007b0  00000000  00000000  000002a0  2**2
              CONTENTS, READONLY, DEBUGGING
	3 .stabstr      00000846  00000000  00000000  00000a50  2**0
              CONTENTS, READONLY, DEBUGGING
	4 .comment      00000024  00000000  00000000  00001296  2**0
              CONTENTS, READONLY
```

ELF文件通过程序头（program header）来决定怎样加载段，程序头说明了ELF对象的哪些部分被载入内存以及载入的目的地址，通过命令`objdump -x obj/kern/kernel`可以查看程序头：

```objdump
wsgzg@wsgzg-VirtualBox:~/6.828/lab$ objdump -x obj/kern/kernel

obj/kern/kernel:     file format elf32-i386
obj/kern/kernel
architecture: i386, flags 0x00000112:
EXEC_P, HAS_SYMS, D_PAGED
start address 0x0010000c

Program Header:
	LOAD off    0x00001000 vaddr 0xf0100000 paddr 0x00100000 align 2**12
     	filesz 0x0000717b memsz 0x0000717b flags r-x
	LOAD off    0x00009000 vaddr 0xf0108000 paddr 0x00108000 align 2**12
     	filesz 0x0000a300 memsz 0x0000a944 flags rw-
STACK off    0x00000000 vaddr 0x00000000 paddr 0x00000000 align 2**4
     	filesz 0x00000000 memsz 0x00000000 flags rwx
```

需要被载入内存的区域以**“LOAD”**标记，程序头还给出了其它的信息，像虚地址（vaddr）、物理地址（paddr）和载入大小（memsz和filesz）。回到`boot/main.c`中，现在我们知道`ph->p_pa`表示每个段的目的物理地址。
BIOS加载启动扇区到内存地址**0x7c00**处，这是启动扇区的加载地址，同时启动扇区从该地址执行，因此它也是链接地址。在文件`boot/Makefrag`中通过`-Ttext 0x7c00`给链接器来设置链接地址。再看看kernel的加载地址和链接地址，这两个地址是不同的：kernel告诉boot loader将自己加载到低地址（1MB）区，而它期望在高地址开始执行。

