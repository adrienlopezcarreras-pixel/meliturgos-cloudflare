// MELITURGOS — MediaGenerationService (Gen2)
// Squelette backend de génération média multimodale.
// Aucune génération réelle n’est jamais simulée si aucun provider réel n’est configuré.

export class Artifact {
  constructor({ id, kind, mimeType, url, metadata = {}, createdAt = Date.now() }) {
    this.id = id || crypto.randomUUID();
    this.kind = kind;
    this.mimeType = mimeType;
    this.url = url;
    this.metadata = metadata;
    this.createdAt = createdAt;
  }

  toJSON() {
    return {
      id: this.id,
      kind: this.kind,
      mime_type: this.mimeType,
      url: this.url,
      metadata: this.metadata,
      created_at: this.createdAt,
    };
  }
}

export class MediaJob {
  constructor({ id, kind, prompt, params = {}, providerId = null }) {
    this.id = id || crypto.randomUUID();
    this.kind = kind;
    this.prompt = prompt;
    this.params = params;
    this.providerId = providerId;
    this.status = 'queued';
    this.progress = 0;
    this.error = null;
    this.artifacts = [];
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
  }

  toJSON() {
    return {
      id: this.id,
      kind: this.kind,
      status: this.status,
      progress: this.progress,
      error: this.error,
      artifacts: this.artifacts.map(a => a.toJSON()),
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}

export class R2MediaStore {
  constructor(bucket) {
    this.bucket = bucket;
  }

  async put(jobId, buffer, mimeType) {
    if (!this.bucket) throw new Error('MEDIA_BUCKET_UNAVAILABLE');
    const key = `gen2/artifacts/${jobId}`;
    await this.bucket.put(key, buffer, { httpMetadata: { contentType: mimeType } });
    return `/api/media/store/${jobId}`;
  }
}

export class NoOpProvider {
  get id() { return 'noop'; }
  get name() { return 'No provider configured'; }

  canGenerate(kind) { return false; }

  async generate(job) {
    return {
      status: 'unavailable',
      error: 'Aucun provider média réel n’est configuré.',
      artifacts: [],
    };
  }
}

export class MediaGenerationService {
  constructor({ bucket, capabilityBus = null, providers = [] } = {}) {
    this.store = new R2MediaStore(bucket);
    this.capabilityBus = capabilityBus;
    this.providers = providers.length ? providers : [new NoOpProvider()];
    this.jobs = new Map();
  }

  static kinds = ['image', 'audio', 'voice', 'video', 'document', 'mixed'];

  registerProvider(provider) {
    if (!provider || typeof provider.canGenerate !== 'function') {
      throw new Error('Provider must implement canGenerate()');
    }
    this.providers.push(provider);
  }

  findProvider(kind) {
    for (const p of this.providers) {
      if (p.canGenerate(kind)) return p;
    }
    return null;
  }

  async createJob({ kind, prompt, params = {} }) {
    if (!MediaGenerationService.kinds.includes(kind)) {
      throw new Error(`Unsupported media kind: ${kind}`);
    }
    const provider = this.findProvider(kind);
    const job = new MediaJob({
      kind,
      prompt,
      params,
      providerId: provider ? provider.id : null,
    });
    this.jobs.set(job.id, job);
    return job;
  }

  async runJob(job) {
    job.status = 'running';
    job.updatedAt = Date.now();
    const provider = this.findProvider(job.kind);
    if (!provider) {
      job.status = 'unavailable';
      job.error = 'Aucun provider média réel n’est disponible pour ce type.';
      job.progress = 100;
      return job;
    }

    try {
      const result = await provider.generate(job);
      job.status = result.status || 'unavailable';
      job.error = result.error || null;
      job.artifacts = (result.artifacts || []).map(a => new Artifact(a));
      job.progress = job.status === 'completed' ? 100 : 0;
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
      job.progress = 100;
    }
    job.updatedAt = Date.now();
    return job;
  }

  async generate({ kind, prompt, params = {} }) {
    const job = await this.createJob({ kind, prompt, params });
    return this.runJob(job);
  }

  getJob(id) {
    return this.jobs.get(id) || null;
  }
}
