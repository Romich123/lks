import type { BunPlugin } from "bun"

const jsonInlinePlugin: BunPlugin = {
    name: "inline-assets",
    setup(build) {
        // Inline JSON files as JavaScript objects
        build.onLoad({ filter: /\.json$/ }, async (args) => {
            const text = await Bun.file(args.path).text()
            const json = JSON.parse(text)
            return {
                contents: `module.exports = ${JSON.stringify(json)};`,
                loader: "js",
            }
        })

        // Substitute createRequire with normal require in all JS/TS files
        build.onLoad({ filter: /\.(js|jsx|ts|tsx|mjs|cjs)$/ }, async (args) => {
            const text = await Bun.file(args.path).text()

            const createRequirePattern = /createRequire\s*\(\s*[^)]+\s*\)/
            if (!createRequirePattern.test(text)) {
                return undefined
            }

            let contents = text

            // Remove createRequire import statements
            contents = contents.replace(/import\s+\{\s*createRequire\s*\}\s+from\s+["']module["'];?\n?/g, "")
            contents = contents.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+["']module["'];?\n?/g, "")

            // Replace namespace.createRequire(...) with namespace.require
            contents = contents.replace(/(\w+)\.createRequire\s*\(\s*[^)]+\s*\)/g, "$1.require")

            // Replace standalone createRequire(...) calls with just require
            contents = contents.replace(/createRequire\s*\(\s*[^)]+\s*\)/g, "require")

            // Remove ONLY declarations where the variable is literally named "require"
            // and it's assigned from "require" or "Something.require".
            // This avoids accidentally stripping unrelated variables like:
            //   const $config = require('./config.json')
            //   const _utils = require('./utils')
            contents = contents.replace(/(?:const|let|var)\s+require\s*=\s*(?:\w+\.)?require\s*;?\n?/g, "")

            const ext = args.path.slice(args.path.lastIndexOf("."))
            const loaderMap: Record<string, string> = {
                ".js": "js",
                ".jsx": "jsx",
                ".ts": "ts",
                ".tsx": "tsx",
                ".mjs": "js",
                ".cjs": "js",
            }

            return {
                contents,
                loader: (loaderMap[ext] as any) ?? "js",
            }
        })
    },
}

await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: { outfile: "./lks-build/app" },
    plugins: [jsonInlinePlugin],
    env: "inline",
})
