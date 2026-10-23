"""One-command local launcher. Servers start only when the user runs this file."""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / 'backend'
FRONTEND = ROOT / 'frontend'
WINDOWS = os.name == 'nt'


def command(args, cwd):
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def fingerprint(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def setup():
    npm = shutil.which('npm.cmd' if WINDOWS else 'npm')
    if not npm:
        raise RuntimeError('Please install Node.js LTS (includes npm) first.')
    venv = BACKEND / '.venv'
    python = venv / ('Scripts/python.exe' if WINDOWS else 'bin/python')
    if not python.exists():
        print('Creating the game Python environment...', flush=True)
        command([sys.executable, '-m', 'venv', venv], ROOT)
    requirements = BACKEND / 'requirements.txt'
    marker = venv / '.requirements.sha256'
    digest = fingerprint(requirements)
    if not marker.exists() or marker.read_text() != digest:
        print('Installing backend dependencies...', flush=True)
        command([python, '-m', 'pip', 'install', '-r', requirements], BACKEND)
        marker.write_text(digest)
    lock = FRONTEND / 'package-lock.json'
    source = lock if lock.exists() else FRONTEND / 'package.json'
    marker = FRONTEND / 'node_modules' / '.game-dependencies.sha256'
    digest = fingerprint(source)
    if not marker.exists() or marker.read_text() != digest:
        print('Installing frontend dependencies...', flush=True)
        command([npm, 'ci' if lock.exists() else 'install'], FRONTEND)
        marker.write_text(fingerprint(lock if lock.exists() else source))
    command([python, 'manage.py', 'migrate', '--noinput'], BACKEND)
    command([python, 'manage.py', 'check'], BACKEND)
    return python, npm


def stop(processes):
    for process in reversed(processes):
        if process.poll() is None:
            if WINDOWS:
                # npm spawns a child Node process; terminate the whole process tree.
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                os.killpg(process.pid, signal.SIGTERM)
    for process in processes:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def main():
    parser = argparse.ArgumentParser(description='Run the independent Crown & Coin game.')
    parser.add_argument('--setup-only', action='store_true', help='Install/check only; no servers.')
    args = parser.parse_args()
    processes = []
    try:
        python, npm = setup()
        if args.setup_only:
            print('Setup complete. No servers started.')
            return 0
        options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if WINDOWS else {'start_new_session': True}
        processes.append(subprocess.Popen(
            [str(python), '-m', 'daphne', '-b', '127.0.0.1', '-p', '8000', 'crown.asgi:application'],
            cwd=BACKEND, **options))
        processes.append(subprocess.Popen(
            [npm, 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
            cwd=FRONTEND, **options))
        print('\nOpen http://localhost:5173 — Ctrl+C stops both servers.\n', flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
        raise RuntimeError('A server stopped. Check the messages above (ports 8000 / 5173 may be occupied).')
    except KeyboardInterrupt:
        print('\nStopping the game...')
        return 0
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f'\nCould not start: {error}', file=sys.stderr)
        return 1
    finally:
        stop(processes)


if __name__ == '__main__':
    raise SystemExit(main())
