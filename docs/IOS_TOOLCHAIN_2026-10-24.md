# Stable iOS toolchain qualification

This draft selects final Xcode 27.1 build 27A9275 and both iOS SDKs at 27.1,
with the current public XcodeGen 2.46.0 release. It preserves the existing
Swift 6 language mode, minimum iOS 16 support, RoomPlan app code and unsigned
simulator build. No app or test cases are added.

The standard `xcode-27` hosted image is a public preview. The selected Xcode
build is Apple's final release, checked by its actual version/build identity.
No larger paid runner or operator SDK installation is selected. CI's Python
helper uses stable 3.15.1; checkout, Python setup and artifact actions use
current stable releases pinned by full commit SHA.

The generator archive is downloaded from its original publisher, bounded in
size, checked against the publisher's SHA-256 digest and extracted into an
owned job-temporary directory. Paths, duplicate entries and symlinks are
checked. The generator's license and setting presets remain in that directory;
the installation script is not executed. No global tool or SDK path is changed.
`DEVELOPER_DIR` and the generator path apply only to this CI job.

The receipt records the exact source/check-out Git trees, SDKs, Python, Apple
Swift, generator archive/executable hashes and architecture before compiling.
Base/source tree differences fail qualification until reconciled. The native
build log is retained separately. Local preparation checks syntax, JSON/YAML,
archive digest/structure and unchanged app source. No local native build,
application suite, camera access, signing or deployment is performed.

Fresh hosted results remain required. Apple's compiler reports Swift 6.4;
upstream Swift 6.4.1 is a separate toolchain integration gap. The repository's
current CodeQL setup covers JavaScript/Actions, not Swift. Swift analysis still
needs a qualified manual generated-project build path; this draft does not
claim that coverage or disable the existing setup. Simulator compilation does
not establish real-device RoomPlan, camera permissions, capture/export or
operator acceptance.

## Primary sources

- [Apple final release](https://developer.apple.com/news/releases/?id=10152026a)
- [Hosted Xcode image](https://github.com/actions/runner-images/issues/14404)
- [XcodeGen release](https://github.com/yonaskolb/XcodeGen/releases/tag/2.46.0)
- [CodeQL Swift build requirements](https://docs.github.com/en/code-security/reference/code-scanning/codeql/build-options-for-compiled-languages)
