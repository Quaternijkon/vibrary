import path from "node:path";

export type DataPathMode = "portable" | "local";

export type DataPathInput = {
  productName: string;
  execPath: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  exists: (candidate: string) => boolean;
};

export type DataPaths = {
  mode: DataPathMode;
  root: string;
  config: string;
  data: string;
  cache: string;
  libraryFiles: string;
  qdrantStorage: string;
  qdrantSnapshots: string;
  models: string;
  logs: string;
};

export function resolveDataPaths(input: DataPathInput): DataPaths {
  const appDir = path.dirname(input.execPath);
  const portableFlag = path.join(appDir, "portable.flag");
  const portable = input.exists(portableFlag);
  const root = portable ? path.join(appDir, "portable-data") : localAppDataRoot(input);

  return {
    mode: portable ? "portable" : "local",
    root,
    config: path.join(root, "config"),
    data: path.join(root, "data"),
    cache: path.join(root, "data", "cache"),
    libraryFiles: path.join(root, "data", "library", "files"),
    qdrantStorage: path.join(root, "data", "qdrant", "storage"),
    qdrantSnapshots: path.join(root, "data", "qdrant", "snapshots"),
    models: path.join(root, "data", "models"),
    logs: path.join(root, "data", "logs")
  };
}

function localAppDataRoot(input: DataPathInput): string {
  const localAppData = input.env.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error("LOCALAPPDATA is required when portable.flag is absent.");
  }

  return path.join(localAppData, input.productName);
}
