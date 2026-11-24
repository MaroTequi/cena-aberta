"""Operations for the invited alpha. Requires Python 3 and Docker Compose."""
import argparse
import base64
import shutil
import tempfile
import time
import zipfile
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ["docker", "compose", "--project-directory", str(ROOT), "--env-file",
           str(ROOT / "deploy/.env"), "-f", str(ROOT / "compose.yaml"),
           "-f", str(ROOT / "compose.alpha.yaml")]


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def configuration():
    result = run(COMPOSE + ["config", "--format", "json"], capture_output=True, text=True)
    config = json.loads(result.stdout)
    services = config["services"]
    social = services["social"]["environment"]
    web = services["web"]["environment"]
    url = urlparse(web["NEXTAUTH_URL"])
    if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
        raise ValueError("ALPHA_URL deve ser uma origem HTTPS sem caminho ou credenciais.")
    if social["FRONTEND_URL"] != web["NEXTAUTH_URL"]:
        raise ValueError("URLs de login e e-mail divergem.")
    if social["INVITE_ONLY"] != "true" or not social["INVITED_EMAILS"].strip(" ,") or social["EMAIL_MODE"] != "smtp":
        raise ValueError("Convites e SMTP devem estar habilitados.")
    values = [web["NEXTAUTH_SECRET"], social["INTERNAL_SECRET"], social["CATALOG_INTERNAL_SECRET"],
              services["catalog-db"]["environment"]["POSTGRES_PASSWORD"], services["social-db"]["environment"]["POSTGRES_PASSWORD"]]
    if any(len(value) < 32 for value in values) or len(set(values)) != len(values):
        raise ValueError("Use cinco segredos distintos com pelo menos 32 caracteres.")
    for name, service in services.items():
        for port in service.get("ports", []):
            if name != "web" or port.get("host_ip") != "127.0.0.1" or str(port.get("published")) != "3000":
                raise ValueError("Somente o frontend em loopback pode publicar portas.")
    return config


SAMPLE_SQL = "select encode(sha256(content),'hex') from feedback_image order by id limit 1"


def checksum(target):
    digest = hashlib.sha256()
    with target.open("rb") as source:
        while block := source.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def backup():
    configuration()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(3)
    destination = ROOT / "backups" / stamp
    destination.mkdir(parents=True, mode=0o700)
    active = run(COMPOSE + ["ps", "--status", "running", "--services"], capture_output=True, text=True).stdout.split()
    if not {"catalog-db", "social-db"}.issubset(active):
        raise ValueError("Os dois bancos devem estar em execuÃ§Ã£o.")
    writers = [name for name in ("web", "social", "catalog") if name in active]
    began = time.monotonic()
    try:
        if writers:
            run(COMPOSE + ["stop", *writers])
        checksums = {}
        for name in ("catalog", "social"):
            target = destination / (name + ".dump")
            with target.open("wb") as output:
                run(COMPOSE + ["exec", "-T", name + "-db", "pg_dump", "-U", name, "-d", name, "-Fc", "--no-owner", "--no-acl"], stdout=output)
            checksums[target.name] = checksum(target)
        sample = run(COMPOSE + ["exec", "-T", "social-db", "psql", "-XAt", "-U", "social", "-c", SAMPLE_SQL], capture_output=True, text=True).stdout.strip()
        commit = run(["git", "-C", str(ROOT), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
        (destination / "manifest.json").write_text(json.dumps({"commit": commit, "image_sha256": sample, "sha256": checksums}, indent=2) + "\n")
        print("Backup concluÃ­do:", destination)
        print("Copie para armazenamento privado fora da VM e execute restore-check.")
    finally:
        if writers:
            run(COMPOSE + ["start", "--wait", "--wait-timeout", "240", *writers])
            print(f"Parada até confirmação de saúde: {time.monotonic()-began:.1f} s")


def restore_check(directory):
    directory = Path(directory).resolve()
    if directory.is_file() and zipfile.is_zipfile(directory):
        with tempfile.TemporaryDirectory() as temporary, zipfile.ZipFile(directory) as archive:
            for name in ("catalog.dump", "social.dump", "manifest.json"):
                with archive.open(name) as src, (Path(temporary) / name).open("wb") as dest:
                    shutil.copyfileobj(src, dest)
            return restore_check(temporary)
    manifest = json.loads((directory / "manifest.json").read_text())
    for name in ("catalog", "social"):
        target = directory / (name + ".dump")
        if checksum(target) != manifest["sha256"][target.name]:
            raise ValueError("Checksum invÃ¡lido; restauraÃ§Ã£o cancelada.")
    container = "cena-restore-" + secrets.token_hex(8)
    environment = dict(os.environ, POSTGRES_PASSWORD=secrets.token_urlsafe(32))
    started = False
    try:
        run(["docker", "run", "-d", "--name", container, "--network", "none", "--volume", "/var/lib/postgresql/data", "-e", "POSTGRES_PASSWORD", "postgres:16-alpine"], env=environment, stdout=subprocess.DEVNULL)
        started = True
        began = time.monotonic()
        for attempt in range(60):
            ready = subprocess.run(["docker", "exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise ValueError("Banco temporÃ¡rio nÃ£o iniciou.")
        for name in ("catalog", "social"):
            run(["docker", "exec", container, "createdb", "-U", "postgres", name])
            with (directory / (name + ".dump")).open("rb") as source:
                run(["docker", "exec", "-i", container, "pg_restore", "-U", "postgres", "-d", name, "--exit-on-error", "--no-owner", "--no-acl"], stdin=source)
            run(["docker", "exec", container, "psql", "-U", "postgres", "-d", name, "-v", "ON_ERROR_STOP=1", "-c", 'SELECT count(*) FROM flyway_schema_history;'], stdout=subprocess.DEVNULL)
        def sql(statement):
            return run(["docker", "exec", container, "psql", "-XAtq", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "social", "-c", statement], capture_output=True, text=True).stdout.strip()

        sample = sql(SAMPLE_SQL)
        if "image_sha256" in manifest and sample != manifest["image_sha256"]:
            raise ValueError("Imagem restaurada diverge da original.")
        if not sample:
            png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")
            uid = secrets.token_hex(12)
            sql(f"insert into profile(actor,username,name) values('{uid}','{uid}','Teste');"
                f"insert into feedback(id,actor,kind,description,page,app_version) values('{uid}','{uid}','bug','Teste local','/','test');"
                f"insert into feedback_image(id,feedback_id,content,size_bytes) values('{uid}','{uid}',decode('{png.hex()}','hex'),{len(png)})")
            run(["docker","exec",container,"pg_dump","-U","postgres","-d","social","-Fc","--data-only","-t","feedback_image","-f","/tmp/image.dump"])
            sql("truncate feedback_image")
            run(["docker","exec",container,"pg_restore","-U","postgres","-d","social","--exit-on-error","/tmp/image.dump"])
            if sql(SAMPLE_SQL) != hashlib.sha256(png).hexdigest():
                raise ValueError("Falha no teste de recuperação de PNG.")
            print("PNG de teste recuperado com SHA-256 idêntico.")
        peak = subprocess.run(["docker","exec",container,"cat","/sys/fs/cgroup/memory.peak"],capture_output=True,text=True)
        used = run(["docker","exec",container,"du","-sk","/var/lib/postgresql/data"],capture_output=True,text=True).stdout.split()[0]
        print("Dumps e manifesto (bytes):",sum((directory / n).stat().st_size for n in ("catalog.dump","social.dump","manifest.json")))
        print("Dados restaurados (KiB):",used,"| Pico do contêiner (bytes):",peak.stdout.strip() or "indisponível","| Tempo (s):",round(time.monotonic()-began,1))
        print("Dois bancos restaurados em ambiente isolado; bancos do alpha nÃ£o foram alterados.")
    finally:
        if started:
            run(["docker", "rm", "-f", "-v", container], stdout=subprocess.DEVNULL)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "up", "backup", "restore-check"])
    parser.add_argument("directory", nargs="?")
    args = parser.parse_args()
    if args.command == "restore-check":
        if not args.directory:
            parser.error("Informe a pasta de backup.")
        restore_check(args.directory)
    elif args.command == "backup":
        backup()
    else:
        config = configuration()
        print("ConfiguraÃ§Ã£o alpha validada; segredos nÃ£o exibidos.")
        if args.command == "up":
            disposable = config["services"]["web"]["environment"]["NEXTAUTH_URL"] == "https://alpha.example.test"
            existing = run(COMPOSE + ["ps", "--all", "--quiet"], capture_output=True, text=True)
            if existing.stdout.strip() and not disposable:
                raise ValueError("Para atualizar o original, use deploy/release.py promover com o commit homologado.")
            run(COMPOSE + ["up", "-d", "--build", "--wait", "--wait-timeout", "240"])
            run(COMPOSE + ["ps"])
            print("Valide a URL HTTPS e os fluxos antes de compartilhar.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        sys.exit("OperaÃ§Ã£o externa falhou. Confira Docker, configuraÃ§Ã£o e serviÃ§os. Valores privados omitidos.")
    except (ValueError, OSError, KeyError) as error:
        sys.exit(str(error))
