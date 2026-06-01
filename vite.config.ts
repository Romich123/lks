import react from "@vitejs/plugin-react"
import path from "node:path"
import { defineConfig } from "vite"

const pagesRoot = path.resolve(import.meta.dirname, "src/pages")

export default defineConfig({
    root: pagesRoot,
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
        },
    },
    build: {
        outDir: path.resolve(import.meta.dirname, "dist/public"),
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            input: {
                index: path.join(pagesRoot, "index/index.html"),
                classrooms: path.join(pagesRoot, "classrooms/index.html"),
                equipment: path.join(pagesRoot, "equipment/index.html"),
                schedule: path.join(pagesRoot, "schedule/index.html"),
                timetableEdit: path.join(pagesRoot, "timetabled/edit/index.html"),
                timetableShow: path.join(pagesRoot, "timetabled/show/index.html"),
                notFound: path.join(pagesRoot, "404/index.html"),
                serverError: path.join(pagesRoot, "500/index.html"),
            },
        },
    },
})
