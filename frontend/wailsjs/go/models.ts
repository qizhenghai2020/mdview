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

}

