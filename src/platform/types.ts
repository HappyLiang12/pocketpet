export type CommandResult = { status: number; stdout: string; stderr: string };
export type CommandRunner = (command: string, args: string[]) => CommandResult;

export type ServiceConfig = {
  home: string;
  nodePath: string;
  cliPath: string;
  port: number;
};

export type ServiceState = { installed: boolean; running: boolean };

export type ServiceManager = {
  install(cfg: ServiceConfig): Promise<void>;
  uninstall(cfg: ServiceConfig): Promise<void>;
  status(cfg: ServiceConfig): Promise<ServiceState>;
};

export type HostIdentity = {
  localHostname(): string | null;
  startAdvertisement(): Promise<boolean>;
  stopAdvertisement(): Promise<void>;
};

export type PrivatePaths = {
  protectHome(home: string): void;
  protectLogs(home: string): void;
  protectFile(path: string): void;
};

export type Platform = {
  service: ServiceManager;
  host: HostIdentity;
  security: PrivatePaths;
};
