"""Owned hosted worker only: verify the official stable Swift package before installing."""
import hashlib
import json
import os
import plistlib
import re
import shutil
import subprocess
from pathlib import Path

VERSION = "6.4.1"
URL = "https://download.swift.org/swift-6.4.1-release/xcode/swift-6.4.1-RELEASE/swift-6.4.1-RELEASE-osx.pkg"
SIGNER = "Developer ID Installer: Swift Open Source (V9AUD2URP3)"
TEAM = "V9AUD2URP3"


def main():
    assert os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_OS") == "macOS"
    if os.environ.get("RUNNER_TEMP") != "/Users/runner/work/_temp":
        raise RuntimeError("Only the reviewed disposable macOS runner temp root is allowed")
    command_root = Path("/Users/runner/work/_temp/_runner_file_commands")
    supplied_env = Path(os.environ["GITHUB_ENV"])
    env_name = supplied_env.name
    if not re.fullmatch(r"set_env_[0-9a-f-]{36}", env_name):
        raise RuntimeError("Unexpected runner environment-command filename")
    env_path = command_root / env_name
    if supplied_env != env_path or env_path.resolve(strict=True) != env_path or not env_path.is_file():
        raise RuntimeError("Runner environment-command file escapes its fixed root")
    folder = Path("/Users/runner/work/_temp/packing-current-stable-swift")
    folder.mkdir(exist_ok=False)
    evidence = {"version": VERSION, "url": URL, "expected_signer": SIGNER, "commands": [], "installed": False}

    def run(name, argv, env=None):
        result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, timeout=600)
        (folder / (name + ".log")).write_bytes(result.stdout)
        evidence["commands"].append({"name": name, "argv": argv, "returncode": result.returncode})
        assert result.returncode == 0, f"{name} failed; inspect retained verification output"
        return result.stdout.decode("utf-8", errors="strict")

    try:
        assert shutil.disk_usage(folder).free >= 12 * 1024**3, "Insufficient disposable worker free space"
        package = folder / "swift-6.4.1-RELEASE-osx.pkg"
        run("download", ["curl", "--fail", "--location", "--proto", "=https", "--proto-redir", "=https", "--tlsv1.2", "--max-filesize", str(2 * 1024**3), "--output", str(package), URL])
        with package.open("rb") as stream:
            evidence["package_sha256"] = hashlib.file_digest(stream, "sha256").hexdigest()
        signature = run("package-signature", ["pkgutil", "--check-signature", str(package)])
        assert SIGNER in signature, "Package is not signed by the documented Swift Open Source developer ID"
        run("package-gatekeeper", ["spctl", "--assess", "--type", "install", "--verbose=4", str(package)])
        roots = [Path.home() / "Library/Developer/Toolchains", Path("/Library/Developer/Toolchains")]
        before = {str(root): sorted(p.name for p in root.glob("*.xctoolchain")) for root in roots}
        evidence["toolchain_directories_before"] = before
        run("install", ["installer", "-target", "CurrentUserHomeDirectory", "-pkg", str(package)])
        evidence["installed"] = True
        evidence["toolchain_directories_after"] = {
            str(root): sorted(p.name for p in root.glob("*.xctoolchain")) for root in roots
        }
        # A hosted image may already contain this exact release. Installation
        # success need not create a new directory. Select only the pinned release;
        # its signature, team, resolved path and actual version are still checked.
        candidates = {p.resolve() for root in roots for p in root.glob("*.xctoolchain")
                      if p.name == "swift-6.4.1-RELEASE.xctoolchain"}
        assert len(candidates) == 1, "Expected exactly one pinned release toolchain; inspect recorded directories"
        toolchain = candidates.pop()
        with (toolchain / "Info.plist").open("rb") as stream:
            info = plistlib.load(stream)
        identifier = info["CFBundleIdentifier"]
        assert isinstance(identifier, str) and re.fullmatch(r"[A-Za-z0-9._-]+", identifier)
        compiler = (toolchain / "usr/bin/swiftc").resolve()
        run("compiler-signature-verify", ["codesign", "--verify", "--strict", str(compiler)])
        signing = run("compiler-signing-identity", ["codesign", "--display", "--verbose=4", str(compiler)])
        assert "TeamIdentifier=" + TEAM in signing, "Compiler signer does not match the Swift project"
        selected = dict(os.environ, TOOLCHAINS=identifier)
        actual_path = Path(run("selected-compiler", ["xcrun", "--find", "swiftc"], env=selected).strip()).resolve()
        assert actual_path.is_relative_to(toolchain.resolve()), "xcrun did not select the verified toolchain"
        version = run("actual-swift-version", ["xcrun", "swift", "--version"], env=selected)
        assert re.search(r"\bSwift version 6\.4\.1\b", version), "Compiler version differs from the pinned stable release"
        descriptor = os.open(env_path, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
        with os.fdopen(descriptor, "a", encoding="utf-8") as stream:
            stream.write("TOOLCHAINS=" + identifier + "\n")
        evidence.update({"toolchain_identifier": identifier, "actual_compiler": str(actual_path), "actual_version": version, "signature_and_selection_verified": True})
    finally:
        (folder / "verification.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"version": VERSION, "verified": True, "selection": evidence["toolchain_identifier"]}))


if __name__ == "__main__":
    main()
