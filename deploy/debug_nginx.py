#!/usr/bin/env python3
"""Отладка nginx конфигурации."""

import paramiko

VPS_HOST = '45.90.217.225'
VPS_USER = 'root'
VPS_PASS = 'Ghbnjr77'


def run(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode()
    return exit_code, out, err


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS)

    try:
        print("=== Nginx test config ===")
        rc, out, err = run(ssh, 'cat /etc/nginx/sites-enabled/test')
        print(out)

        print("=== Nginx sites-enabled ===")
        rc, out, err = run(ssh, 'ls -la /etc/nginx/sites-enabled/')
        print(out)

        print("=== Nginx config test ===")
        rc, out, err = run(ssh, 'nginx -t 2>&1')
        print(out or err)

        print("=== Test with curl from VPS ===")
        rc, out, err = run(ssh, 'apt list --installed 2>/dev/null | grep curl')
        if 'curl' in out:
            rc, out, err = run(ssh, 'curl -s -I http://127.0.0.1/admin')
            print(out)
        else:
            print("curl not installed, using wget")
            rc, out, err = run(ssh, 'wget -S -O- http://127.0.0.1/admin 2>&1 | head -20')
            print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
