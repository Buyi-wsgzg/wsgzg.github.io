---
layout: post
category : OS
tagline: "Supporting tagline"
tags : [JOS, lab]
---
{% include JB/setup %}

### 汇编语言学习

相关推荐资料

- [Brennan's Guide to Inline Assembly](http://www.delorie.com/djgpp/doc/brennan/brennan_att_inline_djgpp.html)
- [IA-32 Intel Architecture Software Developer's Manuals](http://www.intel.com/content/www/us/en/processors/architectures-software-developer-manuals.html)
- [80386 Programmer's Reference Manual](http://pdosnew.csail.mit.edu/6.828/2014/readings/i386/toc.htm)

### x86仿真

JOS使用仿真器来代替真实的物理机器运行操作系统。在仿真器上实验的好处之一就是可以在操作系统内部设置断点，但在真实的机器上，做到这一点是非常困难的。JOS使用qemu仿真器进行实验。但是qemu的debug功能不能支持对boot过程的调试，好在qemu支持远程debug，本实验中使用GNU debugger（GDB）来调试JOS，它可以深入到调试JOS的boot过程。
当从git的仓库中`git clone`出实验代码后，进入目录，运行`make`，如果没有出现错误，我们得到kernel image（kernel.img）。

<!-- more -->

	wsgzg@wsgzg-VirtualBox:~/6.828$ cd lab
	wsgzg@wsgzg-VirtualBox:~/6.828/lab$ make
	+ as kern/entry.S
	+ cc kern/entrypgdir.c
	+ cc kern/init.c
	+ cc kern/console.c
	+ cc kern/monitor.c
	+ cc kern/printf.c
	+ cc kern/kdebug.c
	+ cc lib/printfmt.c
	+ cc lib/readline.c
	+ cc lib/string.c
	+ ld obj/kern/kernel
	+ as boot/boot.S
	+ cc -Os boot/main.c
	+ ld boot/boot
	boot block is 380 bytes (max 510)
	+ mk obj/kern/kernel.img

现在可以启动qemu来运行JOS，使用命令`make qemu`即可启动OS，出现下列信息表示系统启动没有问题。

	wsgzg@wsgzg-VirtualBox:~/6.828/lab$ make qemu
	sed "s/localhost:1234/localhost:26000/" < .gdbinit.tmpl > .gdbinit
	qemu-system-i386 -hda obj/kern/kernel.img -serial mon:stdio -gdb tcp::26000 -D qemu.log 
	6828 decimal is XXX octal!
	entering test_backtrace 5
	entering test_backtrace 4
	entering test_backtrace 3
	entering test_backtrace 2
	entering test_backtrace 1
	entering test_backtrace 0
	leaving test_backtrace 0
	leaving test_backtrace 1
	leaving test_backtrace 2
	leaving test_backtrace 3
	leaving test_backtrace 4
	leaving test_backtrace 5
	Welcome to the JOS kernel monitor!
	Type 'help' for a list of commands.
	K>

若在安装qemu之前安装SDL，则在启动qemu的同时会启动qemu仿真窗口：

![qemu start](/assets/images/qemu.png)

实验中仅仅给出kernel的monitor的两个命令，`help`和`kerninfo`：

	K> help
	help - Display this list of commands
	kerninfo - Display information about the kernel
	K> kerninfo
	Special kernel symbols:
  		_start                  0010000c (phys)
  		entry  f010000c (virt)  0010000c (phys)
  		etext  f0101907 (virt)  00101907 (phys)
  		edata  f0112300 (virt)  00112300 (phys)
  		end    f0112944 (virt)  00112944 (phys)
	Kernel executable memory footprint: 75KB
	K>

### 物理内存布局

PC的物理地址空间被硬布线成下面的内存布局：

![memory layout](/assets/images/memory_layout.png)

最初的基于Intel 8088处理器的PC机，仅仅能够寻址1MB的物理内存。早期PC的物理地址空间从0x00000000到0x000fffff，而不是现在的0xffffffff。其中，从0x00000000到0x000a0000的640KB地址空间叫做“低内存”区，是早期PC仅能够使用的。从0x000a0000到0x000fffff的384KB空间被硬件保留作特殊用途，如显卡缓冲区或者固件。最重要的当然属BIOS，位于从内存0x000f0000到0x000fffff的64KB区域。早期PC的BIOS都是存储在ROM中的，但现在的都是存储在闪存（flash memory）中。BIOS负责完成基本硬件的初始化工作，如激活显卡、检查内存数量等。当完成了初始化工作后，BIOS还负责将操作系统从软盘、硬盘、CD\_ROM或者网络加载到内存，然后将执行控制权交给操作系统。

> Intel的80286和80386处理器最终“突破1MB内存墙”，支持16MB和4GB的物理地址空间。为了保持和已有软件的向下兼容性，PC架构师们不得不保留原始内存的1MB低内存物理地址空间。因此，现代PC都有一个“空洞”，从物理地址0x000a0000到0x00100000，划分RAM为“低内存”（最开始的640KB）和“扩展内存”。此外，32-bit物理地址空间的最高端部分通常被BIOS保留给PCI设备使用。

### ROM BIOS
在实验中，我们将通过qemu的debug功能来观察IA-32兼容计算机的boot过程。
打开两个终端窗口，其中一个输入`make qemu-gdb`，命令启动qemu且qemu停留在处理器执行第一条指令前，等待gdb的调试连接，在第二个终端的相同目录运行`make`，再运行`gdb`，可以看到如下显示信息：

	GNU gdb (Ubuntu 7.7.1-0ubuntu5~14.04.2) 7.7.1
	Copyright (C) 2014 Free Software Foundation, Inc.
	License GPLv3+: GNU GPL version 3 or later <http://gnu.org/licenses/gpl.html>
	This is free software: you are free to change and redistribute it.
	There is NO WARRANTY, to the extent permitted by law.  Type "show copying" and "show warranty" for details.
	This GDB was configured as "x86_64-linux-gnu".
	Type "show configuration" for configuration details.
	For bug reporting instructions, please see:
	<http://www.gnu.org/software/gdb/bugs/>.
	Find the GDB manual and other documentation resources online at:
	<http://www.gnu.org/software/gdb/documentation/>.
	For help, type "help".
	Type "apropos word" to search for commands related to "word".
	+ target remote localhost:26000
	warning: A handler for the OS ABI "GNU/Linux" is not built into this configuration of GDB.  Attempting to continue with the default i8086 settings.
	
	The target architecture is assumed to be i8086
	[f000:fff0]    0xffff0:	ljmp   $0xf000,$0xe05b
	0x0000fff0 in ?? ()
	+ symbol-file obj/kern/kernel
	(gdb)
    
`[f000:fff0]    0xffff0:	ljmp   $0xf000,$0xe05b`是gdb反汇编出来的将要执行的第一条指令。从这行输出我们可以知道事实：

- PC开始执行的物理地址是0x000ffff0，这是为ROM BIOS保留的64KB中的高端地址。
- PC开始执行时的CS=0xf000，IP=0xfff0。
- 第一条指令执行jmp操作，跳转的段地址是CS=0xf000，IP=0xe05b。

在PC机中BIOS被硬布线到物理地址0x000f0000-0x000fffff间，这保证当系统加电启动或重启的时候，BIOS总是能够首先得到机器的控制权。qemu也有自己的BIOS，它被放置在处理器的仿真物理地址空间。当处理器启动时，它首先进入实模式，设置CS为0xf000，IP为0xfff0，然后在CS:IP段地址处开始执行（物理地址=16\*段地址+偏移）。

>乘以16的16进制乘法是非常简单的，仅仅在末尾添加一个0即可
>
>- 16 \* 0xf000 + 0xfff0
>- =0xf0000 + 0xfff0
>- =0xffff0

当BIOS运行时，它设置中断描述符表，初始化各种设备，如VGA等，这就是在qemu窗口显示“SeaBIOS……”的原因。当初始化完PCI总线以及所有BIOS知道的设备后，它开始搜索像软盘、硬盘、CD-ROM这样的可启动设备。一旦找到，BIOS读取boot loader然后将控制权交给它。






