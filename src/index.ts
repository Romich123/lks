import { serve } from "bun"
import { apiRoutes } from "./api"
import { getAdmin } from "./api/auth"
import { urls } from "./pages/urls"
import { fetchNSTUSchedule, fetchNSTUFacultyGroups, Schedule, fetchNSTUExams } from "./lib/nstuParsing"

import index from "./pages/index/index.html"
import schedulePage from "./pages/schedule/index.html"
import classroomsPage from "./pages/classrooms/index.html"
import equipmentPage from "./pages/equipment/index.html"
import timetableShowPage from "./pages/timetabled/show/index.html"
import timetableEditPage from "./pages/timetabled/edit/index.html"
import page404 from "./pages/404/index.html"
import page500 from "./pages/500/index.html"

import path from "node:path"
import "./env"

export const rootPath = import.meta.dir
export const schedulePath = path.join(rootPath, "schedule.json")
export const timeTablePath = path.join(rootPath, "timetabled.json")

console.log("Расписание хранится в ", schedulePath)

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
    "5-КЗ",
    "6-309",
]

const wsClientStopped = new Map<string, boolean>()

const server = serve({
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    routes: {
        [urls.index]: index,
        // [urls.classrooms]: classroomsPage,
        // [urls.equipment]: equipmentPage,
        [urls.schedule]: schedulePage,
        [urls.timetableShow]: timetableShowPage,
        [urls.timetableEdit]: timetableEditPage,
        "/server-error": page500,
        "/parse-schedule": async (req) => {
            if (!getAdmin(req)) {
                return Response.json({ success: false, requiresAuth: true, requiresAdmin: true }, { status: 401 })
            }

            const { searchParams } = new URL(req.url)

            const weekParam = Number(searchParams.get("week"))
            const defaultWeeks = Array.from({ length: 18 }, (_, i) => i + 1)

            const weeks = Number.isSafeInteger(weekParam) && weekParam > 0 ? [weekParam] : defaultWeeks
            const data = server.upgrade(req, { data: { connectionReason: { type: "parsing", weeks: weeks }, id: Bun.randomUUIDv7() } })

            if (!data) {
                return undefined
            }

            return Response.json({ success: false })
        },
        // Serve 404 for all unmatched routes.
        ...apiRoutes,
    },

    websocket: {
        data: {} as { connectionReason?: { type: "parsing"; weeks: number[] }; id: string },
        async open(ws) {
            ws.binaryType = "uint8array"
            wsClientStopped.set(ws.data.id, false)
            if (ws.data.connectionReason?.type === "parsing") {
                const groups = await fetchNSTUFacultyGroups("2")
                const classrooms = neededRooms

                const dataStream = fetchNSTUSchedule(groups, classrooms, ws.data.connectionReason.weeks)

                let data
                while ((data = await dataStream.next()) && !data.done) {
                    if (wsClientStopped.get(ws.data.id)) {
                        return
                    }

                    ws.send(JSON.stringify(data.value))
                }

                try {
                    const oldData = (await Bun.file(schedulePath).json()) as Schedule

                    for (const week of ws.data.connectionReason.weeks) {
                        oldData.lessons[week] = data.value.lessons[week]!
                        oldData.consults = data.value.consults
                    }

                    await Bun.write(schedulePath, JSON.stringify(oldData))

                    ws.send(JSON.stringify({ type: "Ready", schedule: oldData }))
                    ws.close()
                } catch {
                    ws.send(JSON.stringify({ type: "Ready", schedule: data.value }))
                    ws.close()
                }
            }
        },
        message() {},
        close(ws) {
            wsClientStopped.set(ws.data.id, true)
        },
        drain() {},
    },
    error(error) {
        console.log("Error:", error)
        return Response.redirect(`/server-error?errno=${error.errno}&text=${error.message}`)
    },
    development: process.env.NODE_ENV !== "production" && {
        // Enable browser hot reloading in development
        hmr: true,

        // Echo console logs from the browser to the server
        console: true,
    },
})

console.log(`🚀 Server running at ${server.url}`)
