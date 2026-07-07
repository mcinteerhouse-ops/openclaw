// Read-only Claw artifact selector and provenance preview helpers.
import type {
  ClawArtifactInstallSurface,
  ClawArtifactPreview,
  ClawArtifactProvenanceRecord,
  ClawArtifactSource,
  ClawPackageEntry,
} from "./types.js";

type ParsedSelector = {
  source: ClawArtifactSource;
  packageName?: string;
  version?: string;
  pinned?: boolean;
  supported: boolean;
};

const INSTALL_SURFACE_BY_KIND: Record<ClawPackageEntry["kind"], ClawArtifactInstallSurface> = {
  skill: "skills",
  plugin: "plugins",
  mcpServer: "mcpServers",
  connector: "connectors",
};

const PROVENANCE_RECORD_BY_KIND: Record<ClawPackageEntry["kind"], ClawArtifactProvenanceRecord> = {
  skill: "skill.clawhubOrigin",
  plugin: "plugin.installRecord",
  mcpServer: "mcpServer.installRecord",
  connector: "connector.installRecord",
};

const UNSCOPED_NPM_NAME_RE = /^[a-z0-9][a-z0-9-._~]*$/;
const SCOPED_NPM_NAME_RE = /^@[a-z0-9][a-z0-9-._~]*\/[a-z0-9][a-z0-9-._~]*$/;
const EXACT_SEMVER_VERSION_RE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
const DIST_TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function splitVersionedRef(value: string): { packageName: string; version?: string } | null {
  const at = value.lastIndexOf("@");
  if (at > 0) {
    const version = value.slice(at + 1);
    if (!version) {
      return null;
    }
    return { packageName: value.slice(0, at), version };
  }
  return { packageName: value };
}

function parseClawHubSelector(selector: string): ParsedSelector {
  const ref = selector.slice("clawhub:".length).trim();
  if (!ref) {
    return { source: "clawhub", supported: false };
  }
  const parsed = splitVersionedRef(ref);
  if (!parsed) {
    return { source: "clawhub", supported: false };
  }
  return {
    source: "clawhub",
    supported: true,
    ...parsed,
    pinned: parsed.version ? EXACT_SEMVER_VERSION_RE.test(parsed.version) : false,
  };
}

function parseNpmSelector(selector: string): ParsedSelector {
  const spec = selector.slice("npm:".length).trim();
  if (!spec || /\s|:\/\/|#|:/.test(spec)) {
    return { source: "npm", supported: false };
  }

  const parsed = splitVersionedRef(spec);
  if (!parsed) {
    return { source: "npm", supported: false };
  }

  const validName = parsed.packageName.startsWith("@")
    ? SCOPED_NPM_NAME_RE.test(parsed.packageName)
    : UNSCOPED_NPM_NAME_RE.test(parsed.packageName);
  const exactVersion = parsed.version ? EXACT_SEMVER_VERSION_RE.test(parsed.version) : false;
  const validSelector =
    parsed.version === undefined || exactVersion || DIST_TAG_RE.test(parsed.version);
  if (!validName || !validSelector) {
    return { source: "npm", supported: false };
  }

  return {
    source: "npm",
    supported: true,
    packageName: parsed.packageName,
    ...(parsed.version ? { version: parsed.version } : {}),
    pinned: exactVersion,
  };
}

function isAbsoluteLocalPath(selector: string): boolean {
  return (
    selector.startsWith("/") || /^[A-Za-z]:[\\/]/.test(selector) || selector.startsWith("\\\\")
  );
}

function parseArtifactSelector(selector: string): ParsedSelector {
  if (selector.startsWith("clawhub:")) {
    return parseClawHubSelector(selector);
  }
  if (selector.startsWith("npm:")) {
    return parseNpmSelector(selector);
  }
  if (selector.startsWith("npm-pack:")) {
    return { source: "npmPack", supported: selector.slice("npm-pack:".length).trim().length > 0 };
  }
  if (selector.startsWith("git+")) {
    return { source: "git", supported: selector.slice("git+".length).trim().length > 0 };
  }
  if (selector.startsWith("git:")) {
    return { source: "git", supported: selector.slice("git:".length).trim().length > 0 };
  }
  if (selector.startsWith("file:")) {
    return { source: "path", supported: selector.slice("file:".length).trim().length > 0 };
  }
  if (selector.startsWith("./") || selector.startsWith("../") || isAbsoluteLocalPath(selector)) {
    return { source: "path", supported: true };
  }
  return { source: "unknown", supported: false };
}

function pinningFor(parsed: ParsedSelector): ClawArtifactPreview["provenance"]["pinning"] {
  if (!parsed.supported) {
    return "unknown";
  }
  return parsed.pinned ? "pinned" : "floating";
}

export function buildClawArtifactPreview(entry: ClawPackageEntry): ClawArtifactPreview {
  const parsed = parseArtifactSelector(entry.selector);
  return {
    source: parsed.source,
    selector: entry.selector,
    installSurface: INSTALL_SURFACE_BY_KIND[entry.kind],
    ...(parsed.packageName ? { packageName: parsed.packageName } : {}),
    ...(parsed.version ? { version: parsed.version } : {}),
    provenance: {
      record: PROVENANCE_RECORD_BY_KIND[entry.kind],
      requestedSpecifier: entry.selector,
      pinning: pinningFor(parsed),
    },
    supported: parsed.supported,
  };
}
