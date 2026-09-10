import { Log } from './logger';

export interface CredentialSource {
  type: 'env' | 'inline';
  role?: string;
  username?: string;
  password?: string;
}

export interface Credentials {
  username: string;
  password: string;
  mfaSecret?: string;
  role?: string;
  metadata?: Record<string, string | undefined>;
}

interface CredentialRecord {
  username?: string;
  user?: string;
  email?: string;
  password?: string;
  pass?: string;
  mfaSecret?: string;
  mfa_secret?: string;
  totp_secret?: string;
  role?: string;
  _source?: string;
}

export class CredentialLoader {
  static async loadCredentials(source: CredentialSource): Promise<Credentials> {
    Log.info(`Loading credentials from ${source.type} source`);
    try {
      const { records } = this._resolveSource(source);
      const record = source.role
        ? records.find(r => r.role === source.role || r.username === source.role)
        : records[0];
      if (!record) throw new Error(`No credentials found for role: ${source.role || 'default'}`);
      const credentials = this._mapRecord(record, source.role);
      this.validateCredentials(credentials);
      Log.info(`[OK] Credentials loaded for: ${credentials.username}`);
      return credentials;
    } catch (error) {
      Log.error(`Failed to load credentials: ${error}`);
      throw error;
    }
  }

  static async loadCredentialsByRole(role: string, source: Omit<CredentialSource, 'role'>): Promise<Credentials> {
    return this.loadCredentials({ ...source, role });
  }

  static async loadAllCredentials(source: CredentialSource): Promise<Credentials[]> {
    Log.info(`Loading all credentials from ${source.type} source`);
    const { records } = this._resolveSource(source);
    const credentialsList = records.map(r => this._mapRecord(r));
    Log.info(`[OK] Loaded ${credentialsList.length} credential sets`);
    return credentialsList;
  }

  static validateCredentials(credentials: Credentials): boolean {
    if (!credentials.username || !credentials.password) {
      throw new Error('Invalid credentials: username and password required');
    }
    if (credentials.username.length < 3) throw new Error('Invalid credentials: username too short');
    if (credentials.password.length < 3) throw new Error('Invalid credentials: password too short');
    return true;
  }

  private static _resolveSource(source: CredentialSource): { records: CredentialRecord[] } {
    if (source.type === 'env') {
      return { records: [this._loadEnvRecord()] };
    }
    if (source.type === 'inline') {
      if (!source.username || !source.password) {
        throw new Error('Inline credentials require username and password');
      }
      return { records: [{ username: source.username, password: source.password, role: 'inline', _source: 'inline' }] };
    }
    throw new Error(`Credential source "${source.type}" is not supported. Use { type: 'env' } or { type: 'inline' }.`);
  }

  private static _mapRecord(record: CredentialRecord, role?: string): Credentials {
    // Never expose secrets through metadata — strip password / mfa fields before surfacing the record.
    const safeMeta = { ...record } as Record<string, string | undefined>;
    delete safeMeta.password;
    delete safeMeta.pass;
    delete safeMeta.mfaSecret;
    delete safeMeta.mfa_secret;
    delete safeMeta.totp_secret;
    return {
      username: record.username || record.user || record.email || '',
      password: record.password || record.pass || '',
      mfaSecret: record.mfaSecret || record.mfa_secret || record.totp_secret,
      role: record.role || role,
      metadata: safeMeta,
    };
  }

  private static _loadEnvRecord(): CredentialRecord {
    return {
      username: process.env.NAVIGATOR_USERNAME || '',
      password: process.env.NAVIGATOR_PASSWORD || '',
      mfaSecret: process.env.NAVIGATOR_MFA_SECRET || process.env.MFA_SECRET,
      role: 'env',
      _source: 'environment variables',
    };
  }
}
