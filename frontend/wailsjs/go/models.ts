export namespace backend {
	
	export class AIRequestHeader {
	    name: string;
	    value: string;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AIRequestHeader(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.enabled = source["enabled"];
	    }
	}
	export class AIModelConfig {
	    name: string;
	    baseUrl: string;
	    apiKey: string;
	    model: string;
	    timeout: number;
	    formatTimeout: number;
	    headers: AIRequestHeader[];
	    requestTemplate: string;
	    responseMode?: string;
	
	    static createFrom(source: any = {}) {
	        return new AIModelConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.baseUrl = source["baseUrl"];
	        this.apiKey = source["apiKey"];
	        this.model = source["model"];
	        this.timeout = source["timeout"];
	        this.formatTimeout = source["formatTimeout"];
	        this.headers = this.convertValues(source["headers"], AIRequestHeader);
	        this.requestTemplate = source["requestTemplate"];
	        this.responseMode = source["responseMode"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIFormatRequest {
	    markdown: string;
	    instruction: string;
	    format: string;
	    model: AIModelConfig;
	
	    static createFrom(source: any = {}) {
	        return new AIFormatRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.markdown = source["markdown"];
	        this.instruction = source["instruction"];
	        this.format = source["format"];
	        this.model = this.convertValues(source["model"], AIModelConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIGenerateContentRequest {
	    kind: string;
	    language?: string;
	    prompt: string;
	    template?: string;
	    model: AIModelConfig;
	
	    static createFrom(source: any = {}) {
	        return new AIGenerateContentRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.language = source["language"];
	        this.prompt = source["prompt"];
	        this.template = source["template"];
	        this.model = this.convertValues(source["model"], AIModelConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class AIModelTestResult {
	    success: boolean;
	    message: string;
	    content?: string;
	    contentPath?: string;
	    endpoint?: string;
	    method?: string;
	    requestHeaders?: Record<string, string>;
	    requestBody?: string;
	    statusCode?: number;
	    responseHeaders?: Record<string, Array<string>>;
	    responseBody?: string;
	
	    static createFrom(source: any = {}) {
	        return new AIModelTestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.content = source["content"];
	        this.contentPath = source["contentPath"];
	        this.endpoint = source["endpoint"];
	        this.method = source["method"];
	        this.requestHeaders = source["requestHeaders"];
	        this.requestBody = source["requestBody"];
	        this.statusCode = source["statusCode"];
	        this.responseHeaders = source["responseHeaders"];
	        this.responseBody = source["responseBody"];
	    }
	}
	export class AIPresentationGenerationRequest {
	    markdown: string;
	    sourcePath: string;
	    sourceHash: string;
	    fileName: string;
	    assetManifest?: string;
	    instruction?: string;
	    density?: string;
	    targetSlides?: number;
	    batchSize?: number;
	    referenceImages?: string[];
	    referenceMode?: string;
	    referenceUsage?: string;
	    referenceStrength?: string;
	    model: AIModelConfig;
	
	    static createFrom(source: any = {}) {
	        return new AIPresentationGenerationRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.markdown = source["markdown"];
	        this.sourcePath = source["sourcePath"];
	        this.sourceHash = source["sourceHash"];
	        this.fileName = source["fileName"];
	        this.assetManifest = source["assetManifest"];
	        this.instruction = source["instruction"];
	        this.density = source["density"];
	        this.targetSlides = source["targetSlides"];
	        this.batchSize = source["batchSize"];
	        this.referenceImages = source["referenceImages"];
	        this.referenceMode = source["referenceMode"];
	        this.referenceUsage = source["referenceUsage"];
	        this.referenceStrength = source["referenceStrength"];
	        this.model = this.convertValues(source["model"], AIModelConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIPresentationRequest {
	    markdown: string;
	    assetManifest?: string;
	    instruction?: string;
	    model: AIModelConfig;
	
	    static createFrom(source: any = {}) {
	        return new AIPresentationRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.markdown = source["markdown"];
	        this.assetManifest = source["assetManifest"];
	        this.instruction = source["instruction"];
	        this.model = this.convertValues(source["model"], AIModelConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIPresentationSlideRequest {
	    slide: Record<string, any>;
	    context?: Record<string, any>;
	    instruction?: string;
	    referenceImages?: string[];
	    model: AIModelConfig;
	
	    static createFrom(source: any = {}) {
	        return new AIPresentationSlideRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.slide = source["slide"];
	        this.context = source["context"];
	        this.instruction = source["instruction"];
	        this.referenceImages = source["referenceImages"];
	        this.model = this.convertValues(source["model"], AIModelConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class AIThemeRequest {
	    preference: string;
	    currentTheme: string;
	    model: AIModelConfig;
	
	    static createFrom(source: any = {}) {
	        return new AIThemeRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.preference = source["preference"];
	        this.currentTheme = source["currentTheme"];
	        this.model = this.convertValues(source["model"], AIModelConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DesignDraftRecord {
	    sourcePath: string;
	    fileName: string;
	    html: string;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new DesignDraftRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourcePath = source["sourcePath"];
	        this.fileName = source["fileName"];
	        this.html = source["html"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class ExternalFontInfo {
	    value: string;
	    label: string;
	    family: string;
	    stack: string;
	    dataUrl: string;
	    source: string;
	
	    static createFrom(source: any = {}) {
	        return new ExternalFontInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.value = source["value"];
	        this.label = source["label"];
	        this.family = source["family"];
	        this.stack = source["stack"];
	        this.dataUrl = source["dataUrl"];
	        this.source = source["source"];
	    }
	}
	export class FileTreeNode {
	    name: string;
	    path: string;
	    isDir: boolean;
	    children: FileTreeNode[];
	
	    static createFrom(source: any = {}) {
	        return new FileTreeNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isDir = source["isDir"];
	        this.children = this.convertValues(source["children"], FileTreeNode);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FileWorkspace {
	    roots: FileTreeNode[];
	    fileCount: number;
	    skippedCount: number;
	    truncated: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FileWorkspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.roots = this.convertValues(source["roots"], FileTreeNode);
	        this.fileCount = source["fileCount"];
	        this.skippedCount = source["skippedCount"];
	        this.truncated = source["truncated"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PptArtifactVolumeRecord {
	    index: number;
	    fileName: string;
	    html: string;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new PptArtifactVolumeRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.fileName = source["fileName"];
	        this.html = source["html"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class PptArtifactRecord {
	    sourcePath: string;
	    sourceHash: string;
	    fileName: string;
	    html: string;
	    updatedAt: number;
	    shellVersion: string;
	    promptVersion: string;
	    volumes?: PptArtifactVolumeRecord[];
	
	    static createFrom(source: any = {}) {
	        return new PptArtifactRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourcePath = source["sourcePath"];
	        this.sourceHash = source["sourceHash"];
	        this.fileName = source["fileName"];
	        this.html = source["html"];
	        this.updatedAt = source["updatedAt"];
	        this.shellVersion = source["shellVersion"];
	        this.promptVersion = source["promptVersion"];
	        this.volumes = this.convertValues(source["volumes"], PptArtifactVolumeRecord);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class PptGenerationVolumeRecord {
	    index: number;
	    title: string;
	    fileName: string;
	    status: string;
	    documentJson: string;
	    completedSlides: number;
	    totalSlides: number;
	
	    static createFrom(source: any = {}) {
	        return new PptGenerationVolumeRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.title = source["title"];
	        this.fileName = source["fileName"];
	        this.status = source["status"];
	        this.documentJson = source["documentJson"];
	        this.completedSlides = source["completedSlides"];
	        this.totalSlides = source["totalSlides"];
	    }
	}
	export class PptGenerationSlideRecord {
	    id: string;
	    index: number;
	    volumeIndex: number;
	    title: string;
	    status: string;
	    attempts: number;
	    error?: string;
	    rawContent?: string;
	    updatedAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new PptGenerationSlideRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.index = source["index"];
	        this.volumeIndex = source["volumeIndex"];
	        this.title = source["title"];
	        this.status = source["status"];
	        this.attempts = source["attempts"];
	        this.error = source["error"];
	        this.rawContent = source["rawContent"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class PptGenerationJobRecord {
	    jobId: string;
	    sourcePath: string;
	    sourceHash: string;
	    fileName: string;
	    density?: string;
	    targetSlides?: number;
	    batchSize?: number;
	    referenceMode?: string;
	    referenceUsage?: string;
	    referenceStrength?: string;
	    referenceFallback?: boolean;
	    referenceSpecJson?: string;
	    planningVersion?: string;
	    storyPlanJson?: string;
	    designSpecJson?: string;
	    status: string;
	    stage: string;
	    message: string;
	    detail?: string;
	    error?: string;
	    failurePhase?: string;
	    rawContent?: string;
	    completedSlides: number;
	    totalSlides: number;
	    currentSlide: number;
	    currentBatch: number;
	    totalBatches: number;
	    currentVolume: number;
	    canResume: boolean;
	    startedAt: number;
	    updatedAt: number;
	    elapsedMs: number;
	    slides: PptGenerationSlideRecord[];
	    volumes: PptGenerationVolumeRecord[];
	
	    static createFrom(source: any = {}) {
	        return new PptGenerationJobRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.jobId = source["jobId"];
	        this.sourcePath = source["sourcePath"];
	        this.sourceHash = source["sourceHash"];
	        this.fileName = source["fileName"];
	        this.density = source["density"];
	        this.targetSlides = source["targetSlides"];
	        this.batchSize = source["batchSize"];
	        this.referenceMode = source["referenceMode"];
	        this.referenceUsage = source["referenceUsage"];
	        this.referenceStrength = source["referenceStrength"];
	        this.referenceFallback = source["referenceFallback"];
	        this.referenceSpecJson = source["referenceSpecJson"];
	        this.planningVersion = source["planningVersion"];
	        this.storyPlanJson = source["storyPlanJson"];
	        this.designSpecJson = source["designSpecJson"];
	        this.status = source["status"];
	        this.stage = source["stage"];
	        this.message = source["message"];
	        this.detail = source["detail"];
	        this.error = source["error"];
	        this.failurePhase = source["failurePhase"];
	        this.rawContent = source["rawContent"];
	        this.completedSlides = source["completedSlides"];
	        this.totalSlides = source["totalSlides"];
	        this.currentSlide = source["currentSlide"];
	        this.currentBatch = source["currentBatch"];
	        this.totalBatches = source["totalBatches"];
	        this.currentVolume = source["currentVolume"];
	        this.canResume = source["canResume"];
	        this.startedAt = source["startedAt"];
	        this.updatedAt = source["updatedAt"];
	        this.elapsedMs = source["elapsedMs"];
	        this.slides = this.convertValues(source["slides"], PptGenerationSlideRecord);
	        this.volumes = this.convertValues(source["volumes"], PptGenerationVolumeRecord);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

