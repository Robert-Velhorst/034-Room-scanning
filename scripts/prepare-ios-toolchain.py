"""Select an existing hosted SDK and verify a public project generator."""
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import stat
import subprocess
import sys
import urllib.request
import zipfile


def command(args, environment):
    return subprocess.check_output(args, env=environment, text=True, stderr=subprocess.STDOUT, timeout=60).strip()


def main():
    if sys.argv[1:] not in ([], ["--build-settings"]):
        raise RuntimeError("Use without arguments for preparation, or --build-settings after generation.")
    settings_mode = sys.argv[1:] == ["--build-settings"]
    if sys.platform != "darwin" or os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("Preparation is restricted to the disposable macOS CI job.")
    root = Path(__file__).resolve().parents[1]
    profile_bytes = (root / "ios-toolchain.json").read_bytes()
    profile = json.loads(profile_bytes)
    if profile["schema"] != 1 or platform.python_version() != profile["python"]:
        raise RuntimeError("Select the exact Python SDK from ios-toolchain.json.")
    for key in ["xcode", "ios_sdk", "xcodegen"]:
        if not re.fullmatch(r"\d+(?:\.\d+)*", profile[key]):
            raise RuntimeError("SDK/tool versions must be numeric stable selections.")
    if not re.fullmatch(r"[0-9a-f]{64}", profile["xcodegen_sha256"]):
        raise RuntimeError("The public generator archive requires a SHA-256 pin.")
    developer = f"/Applications/Xcode_{profile['xcode']}.app/Contents/Developer"
    if not Path(developer).is_dir():
        raise RuntimeError("The selected SDK is not installed in the hosted image.")
    env = {**os.environ, "DEVELOPER_DIR": developer}
    xcode = command(["xcodebuild", "-version"], env)
    if xcode != f"Xcode {profile['xcode']}\nBuild version {profile['xcode_build']}":
        raise RuntimeError("The installed Xcode build differs from Apple's selected final release.")
    device = command(["xcrun", "--sdk", "iphoneos", "--show-sdk-version"], env)
    simulator = command(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-version"], env)
    if device != profile["ios_sdk"] or simulator != profile["ios_sdk"]:
        raise RuntimeError("Device and simulator SDKs must match the selected stable version.")
    swift = command(["xcrun", "swiftc", "--version"], env)
    version = re.search(r"Apple Swift version ([0-9.]+)\b", swift)
    if version is None or version.group(1) != profile["apple_swift"]:
        raise RuntimeError("The Apple Swift compiler differs from the selected Xcode cohort.")
    source_head = os.environ["SOURCE_HEAD"]
    if not re.fullmatch(r"[0-9a-f]{40}", source_head):
        raise RuntimeError("Expected a complete source commit identity.")
    checkout = command(["git", "rev-parse", "HEAD"], env)
    source_tree = command(["git", "rev-parse", source_head + "^{tree}"], env)
    checkout_tree = command(["git", "rev-parse", "HEAD^{tree}"], env)
    if source_tree != checkout_tree:
        raise RuntimeError("Reconcile source/base changes before qualifying this build.")
    temporary = Path(os.environ["RUNNER_TEMP"]).resolve(strict=True)
    if settings_mode:
        if command(["git", "diff", "--name-only", "HEAD"], env):
            raise RuntimeError("Project generation changed tracked source inputs.")
        extra = command(["git", "ls-files", "--others", "--exclude-standard"], env).splitlines()
        if any(not p.startswith("ios/RoomScanning/RoomScanning.xcodeproj/") for p in extra):
            raise RuntimeError("Unexpected untracked inputs appeared during project generation.")
        settings_result = subprocess.run([
            "xcodebuild", "-project", "ios/RoomScanning/RoomScanning.xcodeproj", "-scheme", "RoomScanning",
            "-destination", "generic/platform=iOS Simulator", "-showBuildSettings", "-json",
        ], env=env, text=True, capture_output=True, timeout=120, check=True)
        raw_settings = settings_result.stdout
        targets = [v for v in json.loads(raw_settings) if v.get("target") == "RoomScanning"]
        if len(targets) != 1:
            raise RuntimeError("Expected the generated RoomScanning target.")
        settings = targets[0]["buildSettings"]
        actual_sdk = command(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-path"], env)
        if settings.get("SWIFT_VERSION") != profile["swift_language_mode"] or Path(settings["SDKROOT"]).resolve() != Path(actual_sdk).resolve():
            raise RuntimeError("Generated target uses an unexpected Swift mode or SDK.")
        receipt = {
            "source_head": source_head, "checked_out_revision": checkout, "source_tree": source_tree,
            "profile_sha256": hashlib.sha256(profile_bytes).hexdigest(),
            "target": "RoomScanning", "swift_language_mode": settings["SWIFT_VERSION"],
            "sdk_root": settings["SDKROOT"], "sdk_version": settings.get("SDK_VERSION"),
            "swift_executable": settings.get("SWIFT_EXEC"),
            "minimum_ios": settings.get("IPHONEOS_DEPLOYMENT_TARGET"),
            "build_settings_sha256": hashlib.sha256(raw_settings.encode()).hexdigest(),
            "build_settings_stderr_sha256": hashlib.sha256(settings_result.stderr.encode()).hexdigest(),
            "application_started": False,
        }
        (temporary / "room-scanning-build-settings.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(receipt))
        return
    if command(["git", "status", "--porcelain"], env):
        raise RuntimeError("Expected a clean checkout before toolchain preparation.")
    url = f"https://github.com/yonaskolb/XcodeGen/releases/download/{profile['xcodegen']}/xcodegen.zip"
    with urllib.request.urlopen(url, timeout=60) as response:
        archive_bytes = response.read(16 * 1024 * 1024 + 1)
    if len(archive_bytes) > 16 * 1024 * 1024 or hashlib.sha256(archive_bytes).hexdigest() != profile["xcodegen_sha256"]:
        raise RuntimeError("The public generator archive differs from the reviewed release digest.")
    destination = temporary / ("room-scanning-xcodegen-" + profile["xcodegen_sha256"][:12])
    destination.mkdir(mode=0o700)
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        entries = archive.infolist()
        if len({e.filename for e in entries}) != len(entries) or sum(e.file_size for e in entries) > 64 * 1024 * 1024:
            raise RuntimeError("Unexpected generator archive structure.")
        for entry in entries:
            relative = PurePosixPath(entry.filename)
            if relative.is_absolute() or ".." in relative.parts or not relative.parts or relative.parts[0] != "xcodegen":
                raise RuntimeError("Generator archive escapes its owned directory.")
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise RuntimeError("Generator archive must not contain symbolic links.")
            target = destination.joinpath(*relative.parts)
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as output:
                output.write(archive.read(entry))
    binary = destination / "xcodegen/bin/xcodegen"
    binary.chmod(0o700)
    generator = command([str(binary), "--version"], env)
    if generator != "Version: " + profile["xcodegen"]:
        raise RuntimeError("The extracted generator reports an unexpected version.")
    receipt = {
        "captured_at": datetime.now(timezone.utc).isoformat(), "profile": profile,
        "profile_sha256": hashlib.sha256(profile_bytes).hexdigest(),
        "source_head": source_head, "checked_out_revision": checkout, "source_tree": source_tree,
        "checked_out_tree": checkout_tree, "python": platform.python_version(), "architecture": platform.machine(),
        "xcode": xcode, "device_sdk": device, "simulator_sdk": simulator, "swift": swift,
        "xcodegen": generator, "xcodegen_url": url,
        "xcodegen_archive_sha256": hashlib.sha256(archive_bytes).hexdigest(),
        "xcodegen_binary_sha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
        "operator_sdk_installed": False, "application_started": False,
    }
    (temporary / "room-scanning-toolchain.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    with Path(os.environ["GITHUB_ENV"]).open("a", encoding="utf-8") as output:
        output.write("DEVELOPER_DIR=" + developer + "\n")
    with Path(os.environ["GITHUB_PATH"]).open("a", encoding="utf-8") as output:
        output.write(str(binary.parent) + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
