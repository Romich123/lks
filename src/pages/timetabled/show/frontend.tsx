import { StrictMode, useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { PageLayout } from "../../layout"
import { dayNames, findCurrentAssignment, formatTime, getCurrentStudyWeek, getDayIndexForDate, normalizeTimetable, Timetable } from "../types"
import styles from "./index.module.css"
import "../../global.css"

const elem = document.getElementById("root")!

function formatClock(date: Date) {
    return formatTime(date.getHours(), date.getMinutes())
}

function App() {
    const [timetable, setTimetable] = useState<Timetable>(() => normalizeTimetable(null))
    const [now, setNow] = useState(new Date())
    const [loadError, setLoadError] = useState<string | null>(null)

    useEffect(() => {
        let stopped = false

        async function load() {
            try {
                const response = await fetch("/api/timetable")
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`)
                }

                const next = normalizeTimetable(await response.json())
                if (!stopped) {
                    setTimetable(next)
                    setLoadError(null)
                }
            } catch (error) {
                if (!stopped) {
                    setLoadError((error as Error).message)
                }
            }
        }

        load()
        const loadTimer = window.setInterval(load, 60_000)
        const clockTimer = window.setInterval(() => setNow(new Date()), 1000)

        return () => {
            stopped = true
            window.clearInterval(loadTimer)
            window.clearInterval(clockTimer)
        }
    }, [])

    const assignment = useMemo(() => findCurrentAssignment(timetable, now), [now, timetable])
    const week = getCurrentStudyWeek(timetable.startWeek, now)
    const dayIndex = getDayIndexForDate(timetable.startWeek, now)
    const parity = week % 2 ? "Нечетная" : "Четная"

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <div>{dayNames[dayIndex % 7]}</div>
                <div>Техническая поддержка ФБ 6-707</div>
            </header>
            <section className={styles.panel}>
                {assignment ? (
                    <div className={styles.workerBlock}>
                        <span className={styles.caption}>Сейчас работает</span>
                        <strong className={styles.workerName}>{assignment.who}</strong>
                        {assignment.contact ? <span className={styles.contact}>{assignment.contact}</span> : null}
                    </div>
                ) : (
                    <div className={styles.workerBlock}>
                        <strong className={styles.workerName}>Сейчас нерабочее время</strong>
                    </div>
                )}
                <div className={styles.meta}>
                    <div>
                        Неделя: <strong>{week}</strong> ({parity})
                    </div>
                    <time>{formatClock(now)}</time>
                </div>
                {loadError ? <div className={styles.error}>Ошибка загрузки: {loadError}</div> : null}
            </section>
        </main>
    )
}

const app = (
    <StrictMode>
        <PageLayout>
            <App />
        </PageLayout>
    </StrictMode>
)

if (import.meta.hot) {
    const root = (import.meta.hot.data.root ??= createRoot(elem))
    root.render(app)
} else {
    createRoot(elem).render(app)
}
