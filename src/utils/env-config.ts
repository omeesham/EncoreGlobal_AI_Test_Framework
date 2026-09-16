import { Page } from '@playwright/test';
import { Log } from './logger';
import { IConfig } from '../types';

export class CommonMethods {
  constructor(_page: Page) {
    Log.info('CommonMethods constructor');
  }

  static initProp(): IConfig {
    const baseUrl = process.env.BASE_URL || '';
    const config: IConfig = {
      browser: process.env.DEFAULT_BROWSER || 'chrome',
      url: baseUrl,
      base_url: baseUrl,
      home_url: process.env.HOME_URL || '',
    };

    return config;
  }
}
