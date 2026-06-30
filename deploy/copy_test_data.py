#!/usr/bin/env python3
"""Копирование данных из test в test_db."""

import paramiko

VPS_HOST = '45.90.217.225'
VPS_USER = 'root'
VPS_PASS = 'Ghbnjr77'


def run(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode()
    return exit_code, out + err


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS)

    try:
        print("[1/5] Копирую users...")
        rc, out = run(ssh, """
            sudo -u postgres psql -d test -c "COPY (SELECT * FROM users) TO '/tmp/users.csv' WITH CSV HEADER"
            sudo -u postgres psql -d test_db -c "DELETE FROM users"
            sudo -u postgres psql -d test_db -c "COPY users FROM '/tmp/users.csv' WITH CSV HEADER"
        """)
        print(f"    {'OK' if rc == 0 else 'ERROR: ' + out}")

        print("[2/5] Копирую organizers...")
        rc, out = run(ssh, """
            sudo -u postgres psql -d test -c "COPY (SELECT * FROM organizers) TO '/tmp/organizers.csv' WITH CSV HEADER"
            sudo -u postgres psql -d test_db -c "DELETE FROM organizers"
            sudo -u postgres psql -d test_db -c "COPY organizers FROM '/tmp/organizers.csv' WITH CSV HEADER"
        """)
        print(f"    {'OK' if rc == 0 else 'ERROR: ' + out}")

        print("[3/5] Копирую locations...")
        rc, out = run(ssh, """
            sudo -u postgres psql -d test -c "COPY (SELECT * FROM locations) TO '/tmp/locations.csv' WITH CSV HEADER"
            sudo -u postgres psql -d test_db -c "DELETE FROM locations"
            sudo -u postgres psql -d test_db -c "COPY locations FROM '/tmp/locations.csv' WITH CSV HEADER"
        """)
        print(f"    {'OK' if rc == 0 else 'ERROR: ' + out}")

        print("[4/5] Копирую events...")
        rc, out = run(ssh, """
            sudo -u postgres psql -d test -c "COPY (SELECT * FROM events) TO '/tmp/events.csv' WITH CSV HEADER"
            sudo -u postgres psql -d test_db -c "DELETE FROM events"
            sudo -u postgres psql -d test_db -c "COPY events FROM '/tmp/events.csv' WITH CSV HEADER"
        """)
        print(f"    {'OK' if rc == 0 else 'ERROR: ' + out}")

        print("[5/5] Проверяю результат...")
        for table in ['users', 'organizers', 'locations', 'events']:
            rc, out = run(ssh, f"sudo -u postgres psql -d test_db -c 'SELECT COUNT(*) FROM {table}'")
            count = out.strip().split('\n')[-2].strip() if rc == 0 else 'ERROR'
            print(f"    {table}: {count}")

        print("\n=== Готово ===")

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
