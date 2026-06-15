import { apiRoutes } from "./api"
import { AppRequest, CookieStore, RouteHandler, getAdmin } from "./api/auth"
import { urls } from "./pages/urls"
import { fetchNSTUFacultyGroups, fetchNSTUSchedule, Schedule } from "./lib/nstuParsing"
import express, { Request, Response as ExpressResponse } from "express"
import { createServer } from "node:http"
import { access, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { WebSocketServer, WebSocket } from "ws"
import "dotenv/config"
import "./env"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")

export const rootPath = __dirname
export const schedulePath = path.join(rootPath, "schedule.json")
export const timeTablePath = path.join(rootPath, "timetabled.json")

console.log("Расписание хранится в: ", schedulePath)

const neededRooms = [
    "6-210",
    "6-401",
    "6-505",
    "6-506",
    "6-509",
    "6-510",
    "6-602",
    "6-603",
    "6-605",
    "6-610",
    "6-611",
    "6-701",
    "6-702",
    "6-704",
    "6-705",
    "6-706",
    "6-710",
    "6-801",
    "6-802",
    "6-803",
    "6-805",
    "6-807",
    "6-811",
    "6-812",
    "6-902",
    "6-903",
    "6-911",
    "6-912",
    "6-1001",
    "6-1007",
    "5-РљР—",
    "6-309",
]

type QueuedCookie = {
    name: string
    value: string
}

function parseCookies(header: string | undefined): Map<string, string> {
    const result = new Map<string, string>()
    if (!header) return result

    for (const item of header.split(";")) {
        const [rawName, ...rawValue] = item.trim().split("=")
        if (!rawName) continue

        result.set(rawName, decodeURIComponent(rawValue.join("=")))
    }

    return result
}

function serializeCookie({ name, value }: QueuedCookie) {
    return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`
}

function createCookieStore(initial: Map<string, string>, queued: QueuedCookie[]): CookieStore {
    return {
        get(name) {
            return initial.get(name)
        },
        set(name, value) {
            initial.set(name, value)
            queued.push({ name, value })
        },
    }
}

function createAppRequest(req: Request, queuedCookies: QueuedCookie[]): AppRequest {
    const cookies = createCookieStore(parseCookies(req.headers.cookie), queuedCookies)

    return {
        url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        params: Object.fromEntries(Object.entries(req.params).map(([key, value]) => [key, Array.isArray(value) ? (value[0] ?? "") : value])),
        cookies,
        async json() {
            return req.body
        },
    }
}

async function sendWebResponse(response: Response, queuedCookies: QueuedCookie[], res: ExpressResponse) {
    res.status(response.status)
    response.headers.forEach((value, key) => res.setHeader(key, value))

    for (const cookie of queuedCookies) {
        res.append("Set-Cookie", serializeCookie(cookie))
    }

    const body = Buffer.from(await response.arrayBuffer())
    res.send(body)
}

function registerRoute(app: express.Express, route: string, method: string, handler: RouteHandler) {
    const expressHandler = async (req: Request, res: ExpressResponse) => {
        const queuedCookies: QueuedCookie[] = []

        try {
            const response = await handler(createAppRequest(req, queuedCookies))
            await sendWebResponse(response, queuedCookies, res)
        } catch (error) {
            console.error("Error:", error)
            res.redirect(`/server-error?text=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`)
        }
    }

    app[method.toLowerCase() as "get" | "post" | "put" | "delete" | "all"](route, expressHandler)
}

function registerApiRoutes(app: express.Express) {
    for (const [route, handlerOrMethods] of Object.entries(apiRoutes)) {
        if (typeof handlerOrMethods === "function") {
            registerRoute(app, route, "all", handlerOrMethods)
            continue
        }

        for (const [method, handler] of Object.entries(handlerOrMethods)) {
            registerRoute(app, route, method, handler)
        }
    }
}

async function registerPageRoutes(app: express.Express) {
    const isProduction = process.env.NODE_ENV === "production"
    const pageMap = new Map([
        [urls.index, "index/index.html"],
        [urls.classrooms, "classrooms/index.html"],
        [urls.equipment, "equipment/index.html"],
        [urls.schedule, "schedule/index.html"],
        [urls.timetableShow, "timetabled/show/index.html"],
        [urls.timetableEdit, "timetabled/edit/index.html"],
        ["/server-error", "500/index.html"],
    ])

    if (isProduction) {
        const publicDir = path.join(projectRoot, "dist/public")
        console.log(`Serving production pages from ${publicDir}`)

        try {
            await access(publicDir)
        } catch {
            throw new Error(`Production build directory not found: ${publicDir}. Run npm run build before npm start.`)
        }

        app.use(express.static(publicDir))

        for (const [route, htmlPath] of pageMap) {
            const pageFile = path.join(publicDir, htmlPath)
            app.get([route, route === "/" ? "/index" : `${route}/`], async (_req, res, next) => {
                try {
                    await access(pageFile)
                    res.sendFile(pageFile)
                } catch (error) {
                    next(error)
                }
            })
        }

        app.use(async (_req, res, next) => {
            const notFoundFile = path.join(publicDir, "404/index.html")
            try {
                await access(notFoundFile)
                res.status(404).sendFile(notFoundFile)
            } catch (error) {
                next(error)
            }
        })
        return
    }

    const { createServer: createViteServer } = await import("vite")
    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "custom",
    })

    for (const [route, htmlPath] of pageMap) {
        app.get([route, route === "/" ? "/index" : `${route}/`], async (req, res, next) => {
            try {
                const sourcePath = path.join(projectRoot, "src/pages", htmlPath)
                const html = await readFile(sourcePath, "utf8")
                res.status(200)
                    .set({ "Content-Type": "text/html" })
                    .end(await vite.transformIndexHtml(req.originalUrl, html))
            } catch (error) {
                vite.ssrFixStacktrace(error as Error)
                next(error)
            }
        })
    }

    app.use(vite.middlewares)

    app.use(async (req, res, next) => {
        try {
            const sourcePath = path.join(projectRoot, "src/pages/404/index.html")
            const html = await readFile(sourcePath, "utf8")
            res.status(404)
                .set({ "Content-Type": "text/html" })
                .end(await vite.transformIndexHtml(req.originalUrl, html))
        } catch (error) {
            next(error)
        }
    })
}

async function runScheduleParsing(ws: WebSocket, id: string, weeks: number[]) {
    wsClientStopped.set(id, false)

    const groups = [...(await fetchNSTUFacultyGroups("2")), ...(await fetchNSTUFacultyGroups("13"))]
    const dataStream = fetchNSTUSchedule(groups, neededRooms, weeks)

    let data
    while ((data = await dataStream.next()) && !data.done) {
        if (wsClientStopped.get(id)) {
            return
        }

        ws.send(JSON.stringify(data.value))
    }

    try {
        const oldData = JSON.parse(await readFile(schedulePath, "utf8")) as Schedule

        for (const week of weeks) {
            oldData.lessons[week] = data.value.lessons[week]!
            oldData.consults = data.value.consults
        }

        await writeFile(schedulePath, JSON.stringify(oldData))

        ws.send(JSON.stringify({ type: "Ready", schedule: oldData }))
        ws.close()
    } catch {
        ws.send(JSON.stringify({ type: "Ready", schedule: data.value }))
        ws.close()
    }
}

const wsClientStopped = new Map<string, boolean>()

async function main() {
    const app = express()
    app.use(express.json({ limit: "10mb" }))

    registerApiRoutes(app)
    await registerPageRoutes(app)

    const server = createServer(app)
    const wss = new WebSocketServer({ noServer: true })

    server.on("upgrade", (req, socket, head) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
        if (url.pathname !== "/parse-schedule") {
            socket.destroy()
            return
        }

        const queuedCookies: QueuedCookie[] = []
        const cookies = createCookieStore(parseCookies(req.headers.cookie), queuedCookies)
        if (!getAdmin({ cookies })) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
            socket.destroy()
            return
        }

        const weekParam = Number(url.searchParams.get("week"))
        const weeks = Number.isSafeInteger(weekParam) && weekParam > 0 ? [weekParam] : Array.from({ length: 18 }, (_, i) => i + 1)
        const id = randomUUID()

        wss.handleUpgrade(req, socket, head, (ws) => {
            ws.on("close", () => wsClientStopped.set(id, true))
            void runScheduleParsing(ws, id, weeks).catch((error) => {
                console.error("WebSocket error:", error)
                ws.close()
            })
        })
    })

    const port = process.env.PORT ? Number(process.env.PORT) : 3000
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`)
    })
}

void main()
