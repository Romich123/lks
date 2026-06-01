import { StrictMode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { PageLayout } from "../../layout"
import { authContext } from "../../shared/auth/AuthProvider"
import { alertsContext } from "../../shared/alerts/AlertsProvider"
import { dayNames, endHour, formatTime, minutesPerPart, normalizeTimetable, parityNames, partsPerHour, startHour, Timetable, TimetableAssignment, totalParts } from "../types"
import styles from "./index.module.css"
import "../../global.css"

type Slot = {
    dayIndex: number
    hour: number
    minute: number
}

type DraftAssignment = {
    from: Slot
    to: Slot
    who: string
    contact: string
}

const elem = document.getElementById("root")!

function slotTime(slot: Slot) {
    return slot.hour * 60 + slot.minute
}

function slotToColumn(slot: Slot) {
    return (slot.hour - startHour) * partsPerHour + slot.minute / minutesPerPart
}

function assignmentToColumns(assignment: TimetableAssignment) {
    const start = (assignment.startHour - startHour) * partsPerHour + assignment.startMinute / minutesPerPart
    const end = (assignment.endHour - startHour) * partsPerHour + assignment.endMinute / minutesPerPart

    return {
        left: `${(start / totalParts) * 100}%`,
        width: `${Math.max(((end - start) / totalParts) * 100, 1)}%`,
    }
}

function normalizeRange(from: Slot, to: Slot) {
    const dayStart = Math.min(from.dayIndex, to.dayIndex)
    const dayEnd = Math.max(from.dayIndex, to.dayIndex)
    const timeStart = Math.min(slotTime(from), slotTime(to))
    const timeEnd = Math.max(slotTime(from), slotTime(to))

    return {
        dayStart,
        dayEnd,
        startHour: Math.floor(timeStart / 60),
        startMinute: timeStart % 60,
        endHour: Math.floor(timeEnd / 60),
        endMinute: timeEnd % 60,
    }
}

function trimExisting(current: TimetableAssignment, inserted: TimetableAssignment): TimetableAssignment | null {
    const currentStart = current.startHour * 60 + current.startMinute
    const currentEnd = current.endHour * 60 + current.endMinute
    const insertedStart = inserted.startHour * 60 + inserted.startMinute
    const insertedEnd = inserted.endHour * 60 + inserted.endMinute

    if (currentStart >= insertedStart && currentEnd <= insertedEnd) {
        return null
    }

    if (insertedStart > currentStart && insertedStart < currentEnd) {
        const end = Math.min(insertedStart, currentEnd)
        return {
            ...current,
            endHour: Math.floor(end / 60),
            endMinute: end % 60,
        }
    }

    if (insertedEnd > currentStart && insertedEnd < currentEnd) {
        const start = Math.max(insertedEnd, currentStart)
        return {
            ...current,
            startHour: Math.floor(start / 60),
            startMinute: start % 60,
        }
    }

    return current
}

function formatDay(dayIndex: number) {
    return `${dayNames[dayIndex % 7]} ${parityNames[Math.floor(dayIndex / 7)]}`
}

function App() {
    const { requestAdmin } = useContext(authContext)
    const { showAlert } = useContext(alertsContext)
    const [timetable, setTimetable] = useState<Timetable>(() => normalizeTimetable(null))
    const [selectedStart, setSelectedStart] = useState<Slot | null>(null)
    const [hoveredSlot, setHoveredSlot] = useState<Slot | null>(null)
    const [draft, setDraft] = useState<DraftAssignment | null>(null)
    const [isDirty, setIsDirty] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    const loadTimetable = useCallback(async () => {
        const response = await fetch("/api/timetable")
        setTimetable(normalizeTimetable(await response.json()))
        setIsDirty(false)
    }, [])

    useEffect(() => {
        loadTimetable().catch((error) => showAlert(error.message, { type: "error" }))
    }, [loadTimetable, showAlert])

    const currentRange = useMemo(() => {
        if (!selectedStart || !hoveredSlot) return null
        return normalizeRange(selectedStart, hoveredSlot)
    }, [hoveredSlot, selectedStart])

    const openDraft = useCallback(
        (slot: Slot) => {
            if (!selectedStart) {
                setSelectedStart(slot)
                setHoveredSlot(slot)
                return
            }

            setDraft({
                from: selectedStart,
                to: slot,
                who: "",
                contact: "",
            })
            setSelectedStart(null)
            setHoveredSlot(null)
        },
        [selectedStart],
    )

    const commitDraft = useCallback(() => {
        if (!draft || !draft.who.trim()) {
            return
        }

        const range = normalizeRange(draft.from, draft.to)
        const assignment: TimetableAssignment = {
            startHour: range.startHour,
            startMinute: range.startMinute,
            endHour: range.endHour,
            endMinute: range.endMinute,
            who: draft.who.trim(),
            contact: draft.contact.trim(),
        }

        setTimetable((prev) => ({
            ...prev,
            schedule: prev.schedule.map((day, dayIndex) => {
                if (dayIndex < range.dayStart || dayIndex > range.dayEnd) {
                    return day
                }

                return [...day.map((item) => trimExisting(item, assignment)).filter((item): item is TimetableAssignment => Boolean(item)), { ...assignment }].sort(
                    (a, b) => a.startHour * 60 + a.startMinute - (b.startHour * 60 + b.startMinute),
                )
            }),
        }))
        setIsDirty(true)
        setDraft(null)
    }, [draft])

    const removeAssignment = useCallback((dayIndex: number, assignmentIndex: number) => {
        setTimetable((prev) => ({
            ...prev,
            schedule: prev.schedule.map((day, index) => (index === dayIndex ? day.filter((_, itemIndex) => itemIndex !== assignmentIndex) : day)),
        }))
        setIsDirty(true)
    }, [])

    const clearTimetable = useCallback(() => {
        setTimetable((prev) => ({
            ...prev,
            schedule: Array.from({ length: 14 }, () => []),
        }))
        setIsDirty(true)
    }, [])

    const saveTimetable = useCallback(async () => {
        const [admin] = await requestAdmin()
        if (!admin) return

        setIsSaving(true)
        try {
            const response = await fetch("/api/timetable", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(timetable),
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            setIsDirty(false)
        } catch (error) {
            showAlert((error as Error).message, { type: "error" })
        } finally {
            setIsSaving(false)
        }
    }, [requestAdmin, showAlert, timetable])

    return (
        <div className={styles.page}>
            <header className={styles.toolbar}>
                <button className={styles.button} onClick={saveTimetable} disabled={isSaving}>
                    {isSaving ? "Сохранение..." : "Сохранить"}
                </button>
                <button className={styles.button} onClick={loadTimetable}>
                    Обновить
                </button>
                <button className={styles.button} onClick={clearTimetable}>
                    Очистить
                </button>
                <label className={styles.weekInput}>
                    Первая неделя
                    <input
                        value={timetable.startWeek}
                        type="number"
                        onChange={(event) => {
                            setTimetable((prev) => ({ ...prev, startWeek: Number(event.target.value) || 0 }))
                            setIsDirty(true)
                        }}
                    />
                </label>
                <span className={styles.state}>{isDirty ? "Есть несохраненные изменения" : "Все изменения сохранены"}</span>
            </header>
            <main className={styles.tableWrap}>
                <div className={styles.grid}>
                    <div className={styles.cornerCell}>День</div>
                    {Array.from({ length: endHour - startHour }, (_, index) => (
                        <div className={styles.hourCell} key={index}>
                            {formatTime(startHour + index, 0)}
                        </div>
                    ))}
                    {timetable.schedule.map((day, dayIndex) => (
                        <div className={styles.dayRow} key={dayIndex}>
                            <div className={styles.dayLabel}>{formatDay(dayIndex)}</div>
                            <div className={styles.slots}>
                                {Array.from({ length: totalParts }, (_, partIndex) => {
                                    const hour = startHour + Math.floor(partIndex / partsPerHour)
                                    const minute = (partIndex % partsPerHour) * minutesPerPart
                                    const slot = { dayIndex, hour, minute }
                                    const column = slotToColumn(slot)
                                    const highlighted =
                                        currentRange &&
                                        dayIndex >= currentRange.dayStart &&
                                        dayIndex <= currentRange.dayEnd &&
                                        column >= (currentRange.startHour - startHour) * partsPerHour + currentRange.startMinute / minutesPerPart &&
                                        column <= (currentRange.endHour - startHour) * partsPerHour + currentRange.endMinute / minutesPerPart

                                    return (
                                        <button
                                            className={`${styles.slot} ${highlighted ? styles.highlighted : ""}`}
                                            key={partIndex}
                                            title={`${formatDay(dayIndex)} ${formatTime(hour, minute)}`}
                                            onMouseMove={() => setHoveredSlot(slot)}
                                            onClick={() => openDraft(slot)}
                                        />
                                    )
                                })}
                                {day.map((assignment, index) => {
                                    const columns = assignmentToColumns(assignment)
                                    return (
                                        <div className={styles.assignment} style={columns} key={`${assignment.startHour}:${assignment.startMinute}:${index}`} title={`${formatTime(assignment.startHour, assignment.startMinute)}-${formatTime(assignment.endHour, assignment.endMinute)} ${assignment.who}`}>
                                            <div className={styles.assignmentText}>
                                                <strong>{assignment.who}</strong>
                                                {assignment.contact ? <span>{assignment.contact}</span> : null}
                                            </div>
                                            <button className={styles.removeButton} onClick={() => removeAssignment(dayIndex, index)} aria-label="Удалить">
                                                x
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </main>
            {draft && (
                <div className={styles.overlay} onClick={() => setDraft(null)}>
                    <form className={styles.dialog} onClick={(event) => event.stopPropagation()} onSubmit={(event) => event.preventDefault()}>
                        <h2>Дежурный</h2>
                        <label>
                            ФИО
                            <input autoFocus value={draft.who} onChange={(event) => setDraft((prev) => (prev ? { ...prev, who: event.target.value } : prev))} />
                        </label>
                        <label>
                            Контакт
                            <input value={draft.contact} onChange={(event) => setDraft((prev) => (prev ? { ...prev, contact: event.target.value } : prev))} />
                        </label>
                        <div className={styles.dialogActions}>
                            <button className={styles.button} onClick={() => setDraft(null)}>
                                Отмена
                            </button>
                            <button className={styles.button} onClick={commitDraft}>
                                Добавить
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
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
