# Current SDK analysis qualification

This follow-up includes the stable native toolchain proposed in PR #9 and
adds an analysis qualification workflow for Actions, JavaScript/TypeScript,
Python and Swift. No app source or test cases change.

The Swift job generates the real Xcode project using the pinned XcodeGen,
verifies final Xcode 27.1 / SDK 27.1 and builds the unsigned arm64 simulator
target between CodeQL initialization and analysis. It does not use an older
Xcode or compiler to make extraction easier. Python uses current 3.15.1.
All actions are stable releases pinned by full commit SHA.

GitHub's current published table lists Swift through 6.3 and Python through
3.14. Its platform table limits macOS 27 to no-build analysis; Swift requires
manual or automatic compilation. Therefore compatibility with the requested
current SDK remains unproven until actual extraction, query results and source
coverage are inspected. A build alone is insufficient.

This workflow uses the documented CodeQL 4.39.1 `upload: never` and disables
database upload. SARIF results and exact tool/source receipts are retained as
ordinary workflow artifacts. The enabled default setup remains in place.
This is a qualification step; it does not add these results to the Security
and quality tab or establish that findings are resolved. A passing action alone
does not mean its SARIF has no findings. Failed extraction must remain visible.

After full coverage and findings are reviewed, prepare the production upload
configuration and a coordinated switch from default to advanced setup. Never
disable the current default scan before a replacement is qualified. No paid
security features or AI preview are enabled.

Native camera/RoomPlan/device, signing and deployment acceptance remain
separate. Production deployment targets Hetzner Cloud under the repository's
own subdomain of noodzakelijkonline.de; this analysis does not publish it.

## Primary sources

- [CodeQL platform requirements](https://codeql.github.com/docs/codeql-overview/system-requirements/)
- [CodeQL language support](https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/)
- [Swift manual build requirements](https://docs.github.com/en/code-security/reference/code-scanning/codeql/build-options-for-compiled-languages)
- [Pinned analyze action inputs](https://github.com/github/codeql-action/blob/9b3254085494b55a0f7c4c2b3d2d52cc712ce370/analyze/action.yml)
