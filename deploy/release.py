"""Implanta um commit em homologação ou promove as imagens dele para o original."""
import argparse
from contextlib import contextmanager
import io
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / "deploy"
HML_ENV = PRIVATE / ".env.hml"
RECEIPT = PRIVATE / ".env.hml-release.json"
APPS = ("catalog", "social", "web", "backup")
HML = "cena-aberta-hml"
ALPHA = "cena-aberta-alpha"


def output(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


@contextmanager
def deployment_lock():
    with (PRIVATE / ".env.deploy.lock").open("a+b") as lock:
        lock.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def initialize():
    if HML_ENV.exists():
        return
    os.umask(0o077)
    keys = ("CATALOG_DB_PASSWORD", "SOCIAL_DB_PASSWORD", "NEXTAUTH_SECRET",
            "CATALOG_INTERNAL_SECRET", "SOCIAL_INTERNAL_SECRET")
    values = {key: secrets.token_urlsafe(40) for key in keys}
    values.update(NEXTAUTH_URL="http://localhost:3001", FRONTEND_URL="http://localhost:3001",
                  EMAIL_ACCOUNTS="true", INVITE_ONLY="true",
                  INVITED_EMAILS="tester1@example.test,tester2@example.test", EMAIL_MODE="smtp",
                  SMTP_HOST="mailpit", SMTP_PORT="1025", SMTP_AUTH="false", SMTP_STARTTLS="false",
                  MAIL_FROM="homologacao@example.test", TMDB_TOKEN="")
    with HML_ENV.open("x", encoding="utf-8") as file:
        file.writelines(f"{key}={value}\n" for key, value in values.items())


def images(commit):
    return {s: f"cena-aberta-release/{s}:{commit}" for s in APPS}


def unpack(commit, destination):
    data = subprocess.check_output(["git", "archive", "--format=zip", commit], cwd=ROOT)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for entry in archive.infolist():
            if not (destination / entry.filename).resolve().is_relative_to(destination):
                raise ValueError("Caminho inválido no snapshot.")
        archive.extractall(destination)


def deploy(action, ref):
    commit = output("git", "rev-parse", "--verify", "--end-of-options", ref + "^{commit}")
    if not re.fullmatch("[0-9a-f]{40}", commit):
        raise ValueError("Commit inválido.")
    stage = action == "hml"
    project = HML if stage else ALPHA
    if stage:
        initialize()
    else:
        main = output("git", "ls-remote", "--exit-code", "origin", "refs/heads/main").split()[0]
        receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
        if commit != main or receipt["commit"] != commit:
            raise ValueError("A promoção exige a ponta da main já implantada na homologação.")
        for service, tag in images(commit).items():
            cid = output("docker", "ps", "-q", "--filter", f"label=com.docker.compose.project={HML}",
                         "--filter", f"label=com.docker.compose.service={service}")
            if not cid or output("docker", "inspect", "-f", "{{.Image}}", cid) != receipt["images"][service] or output("docker", "image", "inspect", "-f", "{{.Id}}", tag) != receipt["images"][service]:
                raise ValueError(f"A imagem de {service} diverge da homologação.")

    with tempfile.TemporaryDirectory(prefix="cena-release-") as folder:
        snapshot = Path(folder).resolve()
        unpack(commit, snapshot)
        override = snapshot / "release-images.json"
        override.write_text(json.dumps({"services": {s: {"image": tag} for s, tag in images(commit).items()}}), encoding="utf-8")
        mode = ROOT / "compose.hml.yaml" if stage else snapshot / "compose.alpha.yaml"
        command = ["docker", "compose", "-p", project, "--project-directory", str(snapshot),
                   "--env-file", str(HML_ENV if stage else PRIVATE / ".env"),
                   "-f", str(snapshot / "compose.yaml"), "-f", str(mode), "-f", str(override)]
        # Compose dá precedência ao ambiente do shell sobre --env-file.
        env = os.environ.copy()
        for source in [snapshot / "compose.yaml", mode]:
            for key in re.findall(r"\$\{([A-Z_][A-Z_0-9]*)", source.read_text(encoding="utf-8")):
                env.pop(key, None)
        def compose(*args, capture=False):
            result = subprocess.run(command + list(args), cwd=snapshot, env=env, check=True,
                                    stdout=subprocess.PIPE if capture else None, text=True)
            return result.stdout
        config = json.loads(compose("config", "--format", "json", capture=True))
        if stage:
            for kind in ("networks", "volumes"):
                for resource in config[kind].values():
                    if resource.get("external") or not resource["name"].startswith(HML + "_"):
                        raise ValueError("Recurso fora da homologação.")
            for service in config["services"].values():
                if service.get("privileged") or service.get("network_mode") or any(
                    mount["type"] != "volume" or mount["source"] not in config["volumes"]
                    for mount in service.get("volumes", [])
                ):
                    raise ValueError("Serviço sem isolamento na homologação.")
            ports = {(name, p.get("host_ip"), str(p["published"])) for name,svc in config["services"].items() for p in svc.get("ports", [])}
            if ports != {("web","127.0.0.1","3001"),("mailpit","127.0.0.1","8025")}:
                raise ValueError("Portas da homologação divergentes.")
            social = config["services"]["social"]["environment"]
            if social.get("SMTP_HOST") != "mailpit" or social.get("EMAIL_MODE") != "smtp":
                raise ValueError("SMTP deve apontar para a caixa de testes.")
            compose("build", *APPS)
        else:
            import alpha
            alpha.backup()
        compose("up", "-d", "--no-build", "--pull", "missing" if stage else "never",
                "--wait", "--wait-timeout", "240")
        deployed = {s: output("docker","inspect","-f","{{.Image}}",compose("ps","-q",s,capture=True).strip()) for s in APPS}
        if stage:
            pending = RECEIPT.with_suffix(".tmp")
            pending.write_text(json.dumps({"commit":commit,"images":deployed},indent=2),encoding="utf-8")
            pending.replace(RECEIPT)
        print(f"{project}: {commit}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["hml","promover"])
    parser.add_argument("ref", help="Commit ou referência Git local")
    args = parser.parse_args()
    try:
        with deployment_lock():
            deploy(args.action,args.ref)
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        sys.exit(f"Implantação interrompida: {exc}")
