import { platform } from "../../src/platform/index.js";

// Child-process test seam. The real Windows ACL/service behavior is covered by
// windows*.test.ts and scripts/windows-integration.mjs; these CLI smoke tests
// exercise command output without touching the host ACL or mDNS transport.
platform.security.protectHome = () => {};
platform.security.protectLogs = () => {};
platform.security.protectFile = () => {};
platform.host.startAdvertisement = async () => false;
