import type { ScrapeReporter, ScrapeSummary } from './events.js';
import type { ScrapeOptions, WebAcquisitionPort } from './port.js';
import { SnapshotStorage } from './storage.js';

export interface ScraperEngineOptions {
  urls: string[];
  outDir: string;
  adapter: WebAcquisitionPort;
  reporter?: ScrapeReporter;
  scrapeOptions?: Partial<ScrapeOptions>;
}

export class ScraperEngine {
  private readonly storage: SnapshotStorage;
  private readonly adapter: WebAcquisitionPort;
  private readonly reporter?: ScrapeReporter;

  constructor(options: { outDir: string; adapter: WebAcquisitionPort; reporter?: ScrapeReporter }) {
    this.storage = new SnapshotStorage(options.outDir);
    this.adapter = options.adapter;
    this.reporter = options.reporter;
  }

  async run(urls: string[], scrapeOptions: Partial<ScrapeOptions> = {}): Promise<ScrapeSummary> {
    const startTime = Date.now();
    const capabilities = this.adapter.getCapabilities();

    this.reporter?.({
      type: 'start',
      totalUrls: urls.length,
      mock: capabilities.provider === 'mock_adapter',
      provider: capabilities.provider
    });

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const index = i + 1;

      this.reporter?.({
        type: 'scraping',
        index,
        total: urls.length,
        url
      });

      try {
        const result = await this.adapter.scrape({
          url,
          formats: ['markdown', 'html'],
          ...scrapeOptions
        });

        if (result.success) {
          const saved = await this.storage.saveSnapshot({ ...result, provider: capabilities.provider });
          succeeded++;
          this.reporter?.({
            type: 'snapshot_saved',
            index,
            snapshotId: saved.snapshotId,
            url,
            contentHash: saved.contentHash,
            snapshotDir: saved.snapshotDir
          });
        } else {
          failed++;
          this.reporter?.({
            type: 'scrape_failed',
            index,
            url,
            code: result.error?.code || 'UNKNOWN',
            reason: result.error?.message || `HTTP ${result.statusCode}`
          });
        }
      } catch (err: unknown) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        this.reporter?.({
          type: 'scrape_failed',
          index,
          url,
          code: 'EXCEPTION',
          reason: message
        });
      }
    }

    const summary: ScrapeSummary = {
      total: urls.length,
      succeeded,
      failed,
      durationMs: Date.now() - startTime,
      outDir: this.storage.getSnapshotsDir()
    };

    this.reporter?.({
      type: 'done',
      summary
    });

    return summary;
  }
}
