#!/usr/bin/env python3
"""
远程部署助手（SFTP + SSH 命令执行）

凭据只从环境变量或本机 SSH 私钥读取，绝不出现在命令行参数或磁盘文件里：
    DEPLOY_HOST / DEPLOY_PORT / DEPLOY_USER / DEPLOY_PASSWORD
    DEPLOY_KEY  —— 私钥路径（如 C:/Users/xxx/.ssh/kangyang_key），设置后免密码登录

用法示例：
    python scripts/deploy.py exec "uname -a"
    python scripts/deploy.py put  ./dist /opt/kangyang/dist
    python scripts/deploy.py run  scripts/deploy-steps.txt

依赖：paramiko（已装在 .workbuddy 的隔离 Python 环境）
"""
import os
import sys
import stat
import posixpath
import argparse

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "")
PORT = int(os.environ.get("DEPLOY_PORT", "22"))
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
KEY = os.environ.get("DEPLOY_KEY", "")

if not HOST or (not PASSWORD and not KEY):
    print("缺少凭据：需要 DEPLOY_HOST 且（DEPLOY_PASSWORD 或 DEPLOY_KEY）", file=sys.stderr)
    sys.exit(2)


def connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=HOST,
        port=PORT,
        username=USER,
        password=PASSWORD or None,
        key_filename=KEY or None,
        timeout=25,
        banner_timeout=25,
        auth_timeout=25,
        look_for_keys=False,
        allow_agent=False,
    )
    return client


def exec_command(client, command, timeout=600, quiet=False):
    """执行命令并返回 (退出码, 标准输出, 标准错误)"""
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout, get_pty=False)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if not quiet:
        if out.strip():
            print(out.rstrip())
        if err.strip():
            print("[stderr] " + err.rstrip(), file=sys.stderr)
    return code, out, err


def sftp_mkdirs(sftp, remote_dir):
    """递归创建远程目录"""
    parts = []
    p = remote_dir
    while p and p != "/":
        parts.append(p)
        p = posixpath.dirname(p)
    for d in reversed(parts):
        try:
            sftp.stat(d)
        except IOError:
            try:
                sftp.mkdir(d)
            except IOError:
                pass


def normalize_remote(path):
    """
    把 Git Bash 的路径转换错误挡在前面。

    Git Bash(MSYS) 会把命令里的 /opt/xxx 当成 Windows 路径转成
    C:/Users/.../opt/xxx，若直接交给 SFTP，就会在服务器上建出一串
    `~/C:/Users/...` 垃圾目录。这里直接拒绝并提示正确用法。
    """
    if len(path) > 1 and path[1] == ":":
        raise SystemExit(
            f"远端路径疑似被 Git Bash 转换成了 Windows 路径：{path}\n"
            "请在命令前加 MSYS_NO_PATHCONV=1 后重试，例如：\n"
            f"  MSYS_NO_PATHCONV=1 python scripts/deploy.py put ./dist {path.split('opt/')[-1] if 'opt/' in path else '/opt/app'}"
        )
    if not path.startswith("/"):
        raise SystemExit(f"远端路径必须是绝对路径（以 / 开头）：{path}")
    return path.rstrip("/") or "/"


def upload_dir(sftp, local_dir, remote_dir, ignore=None):
    """递归上传目录，返回 (文件数, 总字节)"""
    ignore = ignore or []
    count = 0
    total = 0
    sftp_mkdirs(sftp, remote_dir)
    for root, dirs, files in os.walk(local_dir):
        # 过滤忽略项
        dirs[:] = [d for d in dirs if not any(x in d for x in ignore)]
        rel = os.path.relpath(root, local_dir)
        target = remote_dir if rel == "." else posixpath.join(remote_dir, rel.replace(os.sep, "/"))
        sftp_mkdirs(sftp, target)
        for name in files:
            if any(x in name for x in ignore):
                continue
            local_path = os.path.join(root, name)
            remote_path = posixpath.join(target, name)
            try:
                sftp.put(local_path, remote_path)
                total += os.path.getsize(local_path)
                count += 1
            except Exception as e:  # noqa: BLE001
                print(f"[上传失败] {local_path}: {e}", file=sys.stderr)
    return count, total


def cmd_exec(args):
    client = connect()
    try:
        code, _, _ = exec_command(client, args.command, timeout=args.timeout)
        sys.exit(code)
    finally:
        client.close()


def cmd_put(args):
    remote = normalize_remote(args.remote)
    local = args.local
    if not os.path.isdir(local):
        raise SystemExit(f"本地路径不存在或不是目录：{local}")
    client = connect()
    try:
        sftp = client.open_sftp()
        count, total = upload_dir(sftp, local, remote, ignore=args.ignore)
        print(f"已上传 {count} 个文件，共 {total / 1024 / 1024:.2f} MB → {remote}")
        sftp.close()
    finally:
        client.close()


def cmd_putfile(args):
    """上传单个文件（用于精确替换少量文件，避免整目录覆盖误伤线上数据）"""
    remote = normalize_remote(args.remote)
    if not os.path.isfile(args.local):
        raise SystemExit(f"本地文件不存在：{args.local}")
    client = connect()
    try:
        sftp = client.open_sftp()
        sftp_mkdirs(sftp, posixpath.dirname(remote))
        sftp.put(args.local, remote)
        size = os.path.getsize(args.local)
        print(f"已上传 {args.local} → {remote}（{size} 字节）")
        sftp.close()
    finally:
        client.close()


def cmd_run(args):
    """按行执行脚本文件，空行与 # 注释跳过；遇到 `!` 前缀忽略失败"""
    client = connect()
    try:
        with open(args.script, "r", encoding="utf-8") as f:
            lines = [ln.rstrip("\n") for ln in f]
        for i, line in enumerate(lines, 1):
            cmd = line.strip()
            if not cmd or cmd.startswith("#"):
                continue
            tolerate = cmd.startswith("!")
            if tolerate:
                cmd = cmd[1:].strip()
            print(f"\n>>> [{i}] {cmd}")
            code, _, _ = exec_command(client, cmd)
            if code != 0 and not tolerate:
                print(f"\n[中止] 步骤 {i} 失败（退出码 {code}）", file=sys.stderr)
                sys.exit(code)
    finally:
        client.close()


def main():
    parser = argparse.ArgumentParser(description="远程部署助手")
    sub = parser.add_subparsers(dest="action", required=True)

    p1 = sub.add_parser("exec", help="执行单条命令")
    p1.add_argument("command")
    p1.add_argument("--timeout", type=int, default=600)
    p1.set_defaults(func=cmd_exec)

    p2 = sub.add_parser("put", help="上传本地目录")
    p2.add_argument("local")
    p2.add_argument("remote")
    p2.add_argument("--ignore", nargs="*", default=["node_modules", ".git"])
    p2.set_defaults(func=cmd_put)

    p3 = sub.add_parser("putfile", help="上传单个文件")
    p3.add_argument("local")
    p3.add_argument("remote")
    p3.set_defaults(func=cmd_putfile)

    p4 = sub.add_parser("run", help="按脚本逐行执行命令")
    p4.add_argument("script")
    p4.set_defaults(func=cmd_run)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
