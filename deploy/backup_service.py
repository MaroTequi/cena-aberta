"""Internal alpha backup service. Only the web proxy can supply an authenticated actor."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import smtplib
import ssl
import subprocess
import tempfile
import threading
import time
import zipfile
from contextlib import contextmanager, nullcontext
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path("/archive")
TTL = 86400
lock = threading.Lock()
jobs = {}


def pg(database):
    return dict(os.environ, PGHOST=database + "-db", PGUSER=database, PGDATABASE=database,
                PGPASSWORD=os.environ[database.upper() + "_DB_PASSWORD"])


def recipient(actor):
    # Only hexadecimal data enters the SQL literal.
    key = actor.encode().hex()
    sql = f"""select a.email from email_account a join app_admin using(actor)
              join profile p using(actor) where a.state='active' and p.active
              and a.actor=convert_from(decode('{key}','hex'),'UTF8')"""
    return subprocess.check_output(["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
                                   env=pg("social"), timeout=10).decode().strip()


@contextmanager
def social_snapshot():
    with subprocess.Popen(["psql", "-XAtq", "-v", "ON_ERROR_STOP=1"], env=pg("social"),
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True) as session:
        try:
            session.stdin.write("begin isolation level repeatable read read only;\n"
                                "select pg_export_snapshot(), coalesce((select encode(sha256(content),'hex') "
                                "from feedback_image order by id limit 1),'');\n")
            session.stdin.flush()
            snapshot, sample = session.stdout.readline().strip().split("|")
            yield snapshot, sample
        finally:
            session.stdin.close()


def archive(path):
    hashes = {}
    with zipfile.ZipFile(path, "w", allowZip64=True) as output:
        for database in ("catalog", "social"):
            name = database + ".dump"
            digest = hashlib.sha256()
            context = social_snapshot() if database == "social" else nullcontext((None, ""))
            with context as (snapshot, sample):
                options = ["--snapshot", snapshot] if snapshot else []
                with output.open(name, "w", force_zip64=True) as dest, subprocess.Popen(
                        ["pg_dump", "-Fc", "--no-owner", "--no-acl", *options], env=pg(database),
                        stdout=subprocess.PIPE) as process:
                    try:
                        while block := process.stdout.read(1024 * 1024):
                            dest.write(block)
                            digest.update(block)
                    finally:
                        process.stdout.close()
                    if process.wait():
                        raise RuntimeError("dump failed")
            hashes[name] = digest.hexdigest()
        output.writestr("manifest.json", json.dumps({"sha256": hashes, "image_sha256": sample}))


def create(actor, owner):
    try:
        with tempfile.NamedTemporaryFile(dir=ROOT, delete=False, suffix=".part") as partial:
            path = Path(partial.name)
        try:
            archive(path)
            token = secrets.token_hex(24)
            target = ROOT / f"{owner}.{token}.zip"
            path.replace(target)
            try:
                address = recipient(actor)
                if not address:
                    raise ValueError("admin unavailable")
                msg = EmailMessage()
                msg["From"], msg["To"] = os.environ["MAIL_FROM"], address
                msg["Subject"] = "Seu backup do Cena Aberta"
                msg.set_content("Entre com sua conta de administrador e baixe o backup em até 24 horas.\n\n" +
                                os.environ["ALPHA_URL"].rstrip("/") + "/api/v1/backups/" + token)
                with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "587")), timeout=30) as mail:
                    if os.getenv("SMTP_STARTTLS", "true").lower() == "true":
                        mail.starttls(context=ssl.create_default_context())
                    if os.getenv("SMTP_AUTH", "true").lower() == "true":
                        mail.login(os.environ["SMTP_USERNAME"], os.environ["SMTP_PASSWORD"])
                    mail.send_message(msg)
            except Exception:
                target.unlink(missing_ok=True)
                raise
        finally:
            path.unlink(missing_ok=True)
        status = "sent"
    except Exception:
        status = "failed"
    with lock:
        jobs[owner] = status


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Download tokens and identifiers are private.

    def reply(self, code, status):
        data = json.dumps({"status": status}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_job(self):
        actor = self.headers.get("X-Actor", "")
        if not actor or len(actor) > 512 or not hmac.compare_digest(
                self.headers.get("X-Internal-Key", "").encode(), os.environ["INTERNAL_SECRET"].encode()):
            return self.reply(403, "forbidden")
        try:
            if not recipient(actor):
                return self.reply(403, "forbidden")
        except subprocess.SubprocessError:
            return self.reply(503, "unavailable")
        owner = hashlib.sha256(actor.encode()).hexdigest()
        if self.path == "/backups":
            with lock:
                ready = any(p.stat().st_mtime + TTL > time.time() for p in ROOT.glob(owner + ".*.zip"))
                status = jobs.get(owner)
                if status != "working":
                    status = "sent" if ready else "failed" if status == "failed" else "idle"
                if self.command == "POST" and status not in ("working", "sent"):
                    if "working" in jobs.values():
                        return self.reply(409, "busy")
                    status = jobs[owner] = "working"
                    threading.Thread(target=create, args=(actor, owner), daemon=True).start()
            return self.reply(202 if status == "working" else 200, status)
        match = re.fullmatch(r"/backups/([a-f0-9]{48})", self.path)
        if self.command != "GET" or not match:
            return self.reply(404, "missing")
        path = ROOT / f"{owner}.{match[1]}.zip"
        try:
            source = path.open("rb")
        except FileNotFoundError:
            return self.reply(404, "expired")
        with source:
            info = os.fstat(source.fileno())
            if info.st_mtime + TTL <= time.time():
                return self.reply(410, "expired")
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(info.st_size))
            self.send_header("Content-Disposition", 'attachment; filename="cena-aberta-backup.zip"')
            self.end_headers()
            shutil.copyfileobj(source, self.wfile, 1024 * 1024)

    do_GET = do_POST = handle_job


def cleanup():
    while True:
        with lock:
            for path in ROOT.glob("*.zip"):
                if path.stat().st_mtime + TTL <= time.time():
                    path.unlink(missing_ok=True)
        time.sleep(300)


if __name__ == "__main__":
    os.umask(0o077)
    for path in ROOT.glob("*.part"):
        path.unlink()
    threading.Thread(target=cleanup, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", 8183), Handler).serve_forever()
