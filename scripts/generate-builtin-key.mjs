import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const keyPath = join(rootDir, ".key");
const outputPath = join(rootDir, "backend", "builtin_key_private.go");

async function readBuiltinKey() {
  try {
    const raw = await readFile(keyPath, "utf8");
    return raw.trim();
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

const builtinKey = await readBuiltinKey();
const source = `package backend

func init() {
\tbuiltinDefaultAPIKey = ${JSON.stringify(builtinKey)}
}
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, source, "utf8");

if (builtinKey) {
  console.log("[builtin-key] 已从根目录 .key 注入内置默认模型密钥。");
} else {
  console.log("[builtin-key] 根目录 .key 不存在或为空，内置默认模型不会带默认密钥。");
}
