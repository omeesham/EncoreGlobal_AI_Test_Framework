export interface IConfig {
  browser: string;
  url: string;
  base_url: string;
  home_url: string;
  mfa_secret?: string;
  [key: string]: string | undefined;
}
