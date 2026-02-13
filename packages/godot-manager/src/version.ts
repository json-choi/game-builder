export interface GodotVersion {
  major: number;
  minor: number;
  patch: number;
  label: string;
  build: string;
  hash: string;
  raw: string;
}

export const MIN_SUPPORTED_VERSION = { major: 4, minor: 4, patch: 0 };
export const MAX_SUPPORTED_MINOR = 6;

export function parseGodotVersion(raw: string): GodotVersion | null {
  const trimmed = raw.trim();

  // major.minor[.patch][.label][.build][.hash]
  const fullMatch = trimmed.match(
    /^(\d+)\.(\d+)(?:\.(\d+))?(?:\.([a-zA-Z][a-zA-Z0-9]*))?(?:\.([a-zA-Z]+))?(?:\.([a-f0-9]+))?$/
  );

  if (!fullMatch) return null;

  const [, majorStr, minorStr, patchStr, label, build, hash] = fullMatch;
  const major = parseInt(majorStr, 10);
  const minor = parseInt(minorStr, 10);

  // Disambiguate: if "label" is purely numeric, it's actually the patch
  // This handles "4.4.1" where patchStr captures "1"
  const patch = patchStr ? parseInt(patchStr, 10) : 0;

  return {
    major,
    minor,
    patch,
    label: label ?? "stable",
    build: build ?? "",
    hash: hash ?? "",
    raw: trimmed,
  };
}

export function formatVersion(v: GodotVersion): string {
  const base = `${v.major}.${v.minor}.${v.patch}`;
  if (v.label && v.label !== "stable") return `${base}-${v.label}`;
  return base;
}

export function compareVersions(a: GodotVersion, b: GodotVersion): -1 | 0 | 1 {
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }
  return 0;
}

export function isVersionCompatible(version: GodotVersion): boolean {
  if (version.major !== MIN_SUPPORTED_VERSION.major) return false;
  if (version.minor < MIN_SUPPORTED_VERSION.minor) return false;
  if (version.minor > MAX_SUPPORTED_MINOR) return false;
  return true;
}

export function versionCompatibilityMessage(version: GodotVersion): string {
  if (isVersionCompatible(version)) {
    return `Godot ${formatVersion(version)} is compatible (supported: 4.${MIN_SUPPORTED_VERSION.minor}.x – 4.${MAX_SUPPORTED_MINOR}.x)`;
  }
  return `Godot ${formatVersion(version)} is NOT compatible. Supported: 4.${MIN_SUPPORTED_VERSION.minor}.x – 4.${MAX_SUPPORTED_MINOR}.x`;
}

export function getBinaryName(
  version: GodotVersion,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  const ver = `${version.major}.${version.minor}`;
  const archSuffix = arch === "arm64" ? "arm64" : "x86_64";

  switch (platform) {
    case "darwin":
      return "Godot.app/Contents/MacOS/Godot";
    case "win32":
      return `Godot_v${ver}-stable_win64.exe`;
    case "linux":
      return `Godot_v${ver}-stable_linux.${archSuffix}`;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export function getDownloadFilename(
  version: GodotVersion,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  const ver = `${version.major}.${version.minor}`;
  const archSuffix = arch === "arm64" ? "arm64" : "x86_64";

  switch (platform) {
    case "darwin":
      return `Godot_v${ver}-stable_macos.universal.zip`;
    case "win32":
      return `Godot_v${ver}-stable_win64.exe.zip`;
    case "linux":
      return `Godot_v${ver}-stable_linux.${archSuffix}.zip`;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

if (import.meta.main) {
  const testVersions = [
    "4.6.stable.official.89cea1439",
    "4.4.1.stable.official.abc123",
    "4.4",
    "4.3.stable.official.000000",
    "4.7.stable.official.000000",
    "3.5.stable.official.000000",
  ];

  for (const raw of testVersions) {
    const v = parseGodotVersion(raw);
    if (v) {
      console.log(`${raw} → ${formatVersion(v)} | ${versionCompatibilityMessage(v)}`);
    } else {
      console.log(`${raw} → PARSE FAILED`);
    }
  }
}
