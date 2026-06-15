import React, { StrictMode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import styles from "./index.module.css"
import { AuthProvider } from "../shared/auth/AuthProvider"
import { authContext } from "../shared/auth/AuthProvider"
import { AlertsProvider } from "../shared/alerts/AlertsProvider"
import "../reset.css"
import { ConsultingData, LessonData, Schedule, ScheduleFetchingUpdate } from "@/lib/nstuParsing"

const elem = document.getElementById("root")!

const lessonTimesFull = [
    { start: "8:30", end: "10:00" },
    { start: "10:15", end: "11:45" },
    { start: "12:00", end: "13:30" },
    { start: "14:00", end: "15:30" },
    { start: "15:45", end: "17:15" },
    { start: "17:30", end: "19:00" },
]

const firstWeekFirstDay = new Date(2026, 1, 9)
const weekDays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]

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

function getWeekInfo(lessonDate: Date): { weekIndex: number; weekDayIndex: number } {
    const lesson = new Date(lessonDate)
    const scheduleStart = new Date(firstWeekFirstDay)

    lesson.setHours(0, 0, 0, 0)
    scheduleStart.setHours(0, 0, 0, 0)

    const daysDiff = Math.floor((lesson.getTime() - scheduleStart.getTime()) / (24 * 60 * 60 * 1000))

    const weekDayIndex = (lesson.getDay() + 6) % 7

    const weekIndex = Math.floor(daysDiff / 7) + 1

    return { weekIndex, weekDayIndex }
}

function getDateFromWeekInfo(weekIndex: number, weekDayIndex: number): Date {
    const scheduleStart = new Date(firstWeekFirstDay)
    scheduleStart.setHours(0, 0, 0, 0)

    const daysFromStart = (weekIndex - 1) * 7 + weekDayIndex

    const resultDate = new Date(scheduleStart)
    resultDate.setDate(scheduleStart.getDate() + daysFromStart)
    resultDate.setHours(0, 0, 0, 0)

    return resultDate
}

function formatDate(date: Date) {
    return `${date.getDate()}.${(date.getMonth() + 1 + "").padStart(2, "0")}.${date.getFullYear() - 2000}`
}

const todayDateInfo = getWeekInfo(new Date())
let defaultDay = todayDateInfo.weekDayIndex + 1
let defaultWeek = todayDateInfo.weekIndex

if (defaultDay > 5) {
    defaultDay = 0
    defaultWeek += 1
}

function shortenLessonName(name: string) {
    return name
        .split(" ")
        .map((x) => x.charAt(0).toUpperCase())
        .filter((x) => "А".charCodeAt(0) <= x.charCodeAt(0) && x.charCodeAt(0) <= "Я".charCodeAt(0))
        .join("")
}

function parseTime(time: string): readonly [number, number] {
    const [hours, minutes] = time.split(":").map((x) => Number(x))
    return [hours ?? 0, minutes ?? 0] as const
}

type EditTarget = {
    weekIndex: number
    weekDayIndex: number
    lessonIndex: number
    room: string
    teacher: string
    type: string
    entryType: "lesson" | "consult"
}

function RoomTopCell({
    lesson,
    consult,
    span,
    weekIndex,
    weekDayIndex,
    lessonIndex,
    room,
    onEdit,
}: {
    lesson?: LessonData | undefined | null
    consult?: ConsultingData | undefined | null
    span: number
    weekIndex: number
    weekDayIndex: number
    lessonIndex: number
    room: string
    onEdit: (data: EditTarget) => void
}) {
    const handleEdit = () => {
        if (lesson) {
            onEdit({
                weekIndex,
                weekDayIndex,
                lessonIndex,
                room,
                teacher: lesson.teacher ?? "",
                type: lesson.type ?? "",
                entryType: "lesson",
            })
        } else if (consult) {
            onEdit({
                weekIndex,
                weekDayIndex,
                lessonIndex,
                room,
                teacher: consult.teacher ?? "",
                type: consult.type ?? "",
                entryType: "consult",
            })
        } else {
            onEdit({
                weekIndex,
                weekDayIndex,
                lessonIndex,
                room,
                teacher: "",
                type: "",
                entryType: "lesson",
            })
        }
    }

    if (lesson) {
        return (
            <td onClick={handleEdit} colSpan={span * 2} className={`${styles.teacherName} ${styles.editableCell}`}>
                {lesson.teacher ? lesson.teacher : <div className={`${styles.lessonFlag}`}>{shortenLessonName(lesson.name)}</div>}
            </td>
        )
    }

    if (consult) {
        return (
            <td onClick={handleEdit} colSpan={span * 2} className={`${styles.teacherName} ${styles.consult} ${styles.editableCell}`}>
                {consult.teacher}
                <div className={styles.lessonFlag}>{consult.type.charAt(0)}</div>
            </td>
        )
    }

    return (
        <td onClick={handleEdit} colSpan={span * 2} className={`${styles.empty} ${styles.teacherName} ${styles.editableCell}`}>
            ФИО
        </td>
    )
}

function RoomRow({
    room,
    lessons,
    consults,
    insertHead,
    weekIndex,
    weekDayIndex,
    onEdit,
}: {
    room: string
    lessons?: (LessonData | null)[]
    consults?: (ConsultingData | null)[]
    insertHead: boolean
    weekIndex: number
    weekDayIndex: number
    onEdit: (data: EditTarget) => void
}) {
    const topRow = []
    const bottomRow = []

    for (let lessonIndex = 0; lessonIndex < lessonTimesFull.length; lessonIndex++) {
        const time = lessonTimesFull[lessonIndex]!

        let span = 1
        let goingOutside = false
        const lesson = lessons?.[lessonIndex]
        const consult = consults?.[lessonIndex]

        const timeStart = time.start

        while (lesson && lessons?.[lessonIndex + 1]?.teacher === lesson.teacher) {
            if (lessonIndex + 1 >= lessonTimesFull.length) {
                goingOutside = true
                break
            }

            span += 1
            lessonIndex += 1
        }

        const timeEnd = lessonTimesFull[lessonIndex]!.end

        topRow.push(
            <RoomTopCell span={span} key={time.start} lesson={lesson} consult={consult} weekDayIndex={weekDayIndex} weekIndex={weekIndex} lessonIndex={lessonIndex} room={room} onEdit={onEdit} />,
        )
        bottomRow.push(
            <td key={time.start} className={`${styles.signatureCell} ${lesson ? "" : consult ? styles.consult : styles.empty}`}>
                <span>{timeStart}</span>
                <br />
                <span>Подпись</span>
            </td>,
        )
        for (let i = 1; i < span; i++) {
            bottomRow.push(
                <td key={time.start + i} className={`${styles.spaceCell} ${lesson ? "" : consult ? styles.consult : styles.empty}`}>
                    <span></span>
                </td>,
            )
            bottomRow.push(
                <td key={time.start + i + "10"} className={`${styles.spaceCell} ${lesson ? "" : consult ? styles.consult : styles.empty}`}>
                    <span></span>
                </td>,
            )
        }
        if (goingOutside) {
            bottomRow.push(
                <td key={time.end} className={`${styles.spaceCell} ${lesson ? "" : consult ? styles.consult : styles.empty}`}>
                    <span></span>
                </td>,
            )
        } else {
            bottomRow.push(
                <td key={time.end} className={`${styles.signatureCell} ${lesson ? "" : consult ? styles.consult : styles.empty}`}>
                    <span>Подпись</span>
                    <br />
                    <span>{timeEnd}</span>
                </td>,
            )
        }
    }

    return (
        <React.Fragment>
            <tr>
                <td rowSpan={2} className={styles.rowRoomName}>
                    {room.split("-")[1]}
                </td>
                {topRow}
            </tr>
            <tr className={insertHead ? styles.breakAfter : ""}>{bottomRow}</tr>
        </React.Fragment>
    )
}

const pages = 4
const roomsPerPage = Math.floor(neededRooms.length / pages)
const breakAfter = neededRooms.filter((_, index) => (index + 1) % roomsPerPage === 0)

function App() {
    const { requestAdmin } = useContext(authContext)
    const [selectedWeekInput, setSelectedWeekInput] = useState(String(defaultWeek))
    const [selectedWeek, setSelectedWeek] = useState(defaultWeek)
    const [selectedWeekDay, setSelectedWeekDay] = useState(defaultDay)
    const [isWeekFaulty, setWeekFaulty] = useState(false)
    const [allSchedule, setAllSchedule] = useState<Schedule>({ lessons: [], consults: [] })
    const [loadingWeek, setLoadingWeek] = useState<number | null>(null)
    const [isDirty, setIsDirty] = useState(false)
    const [isSaving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [editingCell, setEditingCell] = useState<EditTarget | null>(null)

    const loadSchedule = useCallback(async () => {
        setAllSchedule(await (await fetch("/api/schedule")).json())
        setIsDirty(false)
    }, [])

    const loadSelectedWeek = useCallback(async () => {
        const [admin] = await requestAdmin()

        if (!admin) {
            return
        }

        setSaveError(null)
        setLoadingWeek(selectedWeek)
        setAllSchedule((prev) => {
            const next: Schedule = { lessons: [...prev.lessons], consults: [...prev.consults] }
            next.lessons[selectedWeek] = []
            next.consults[selectedWeek] = []
            return next
        })
        const ws = new WebSocket("/parse-schedule?week=" + selectedWeek)

        ws.onmessage = (e) => {
            try {
                const event = JSON.parse(e.data) as ScheduleFetchingUpdate | { type: "Ready"; schedule: Schedule }

                if (event.type === "Lesson") {
                    const lesson = event.lesson
                    setAllSchedule((prev) => {
                        const next: Schedule = { lessons: [...prev.lessons], consults: [...prev.consults] }
                        next.lessons[lesson.weekIndex] = [...(next.lessons[lesson.weekIndex] ?? [])]
                        next.lessons[lesson.weekIndex]![lesson.weekDayIndex] = { ...(next.lessons[lesson.weekIndex]![lesson.weekDayIndex] ?? {}) }
                        next.lessons[lesson.weekIndex]![lesson.weekDayIndex]![lesson.room] = [...(next.lessons[lesson.weekIndex]![lesson.weekDayIndex]![lesson.room] ?? [])]
                        next.lessons[lesson.weekIndex]![lesson.weekDayIndex]![lesson.room]![lesson.lessonIndex] = lesson
                        return next
                    })
                    setIsDirty(true)
                } else if (event.type === "Consult") {
                    const consult = event.consult
                    setAllSchedule((prev) => {
                        const next: Schedule = { lessons: [...prev.lessons], consults: [...prev.consults] }
                        next.consults[consult.weekIndex] = [...(next.consults[consult.weekIndex] ?? [])]
                        next.consults[consult.weekIndex]![consult.weekDayIndex] = { ...(next.consults[consult.weekIndex]![consult.weekDayIndex] ?? {}) }
                        next.consults[consult.weekIndex]![consult.weekDayIndex]![consult.room] = [...(next.consults[consult.weekIndex]![consult.weekDayIndex]![consult.room] ?? [])]

                        for (let i = consult.lessonStart; i <= consult.lessonEnd; i++) {
                            next.consults[consult.weekIndex]![consult.weekDayIndex]![consult.room]![i] = consult
                        }

                        return next
                    })
                    setIsDirty(true)
                } else if (event.type === "Ready") {
                    setAllSchedule(event.schedule)
                    setLoadingWeek(null)
                    setIsDirty(false)
                }
            } catch {}
        }
    }, [selectedWeek, requestAdmin])

    useEffect(() => {
        loadSchedule()
    }, [loadSchedule])

    const commitEdit = useCallback(() => {
        if (!editingCell) {
            return
        }

        setAllSchedule((prev) => {
            const next: Schedule = {
                lessons: prev.lessons.map((week) => week?.map((day) => ({ ...day }))),
                consults: prev.consults.map((week) => week?.map((day) => ({ ...day }))),
            }

            if (editingCell.entryType === "lesson") {
                next.lessons[editingCell.weekIndex] ??= []
                next.lessons[editingCell.weekIndex]![editingCell.weekDayIndex] ??= {}
                next.lessons[editingCell.weekIndex]![editingCell.weekDayIndex]![editingCell.room] ??= []

                const roomLessons = next.lessons[editingCell.weekIndex]![editingCell.weekDayIndex]![editingCell.room]!
                let lesson = roomLessons[editingCell.lessonIndex]

                if (!lesson) {
                    lesson = {
                        weekIndex: editingCell.weekIndex,
                        weekDayIndex: editingCell.weekDayIndex,
                        room: editingCell.room,
                        teacher: undefined,
                        type: undefined,
                        name: "",
                        groups: "",
                        lessonIndex: editingCell.lessonIndex,
                    }
                    roomLessons[editingCell.lessonIndex] = lesson
                }

                lesson.teacher = editingCell.teacher || undefined
                lesson.type = editingCell.type || undefined
            } else {
                const consult = next.consults[editingCell.weekIndex]?.[editingCell.weekDayIndex]?.[editingCell.room]?.[editingCell.lessonIndex]
                if (consult) {
                    consult.teacher = editingCell.teacher
                    consult.type = editingCell.type as ConsultingData["type"]
                }
            }

            return next
        })

        setIsDirty(true)
        setEditingCell(null)
    }, [editingCell])

    const requestScheduleEdit = useCallback(
        async (target: EditTarget) => {
            const [admin] = await requestAdmin()

            if (admin) {
                setEditingCell(target)
            }
        },
        [requestAdmin],
    )

    const clearLessonCell = useCallback(() => {
        if (!editingCell || editingCell.entryType !== "lesson") {
            return
        }

        setAllSchedule((prev) => {
            const next: Schedule = {
                lessons: prev.lessons.map((week) => week?.map((day) => ({ ...day }))),
                consults: prev.consults.map((week) => week?.map((day) => ({ ...day }))),
            }

            const roomLessons = next.lessons[editingCell.weekIndex]?.[editingCell.weekDayIndex]?.[editingCell.room]
            if (roomLessons) {
                delete roomLessons[editingCell.lessonIndex]
            }

            return next
        })

        setIsDirty(true)
        setEditingCell(null)
    }, [editingCell])

    const toggleEntryType = useCallback(() => {
        if (!editingCell) {
            return
        }

        setAllSchedule((prev) => {
            const next: Schedule = {
                lessons: prev.lessons.map((week) => week?.map((day) => ({ ...day }))),
                consults: prev.consults.map((week) => week?.map((day) => ({ ...day }))),
            }

            if (editingCell.entryType === "lesson") {
                next.consults[editingCell.weekIndex] ??= []
                next.consults[editingCell.weekIndex]![editingCell.weekDayIndex] ??= {}
                next.consults[editingCell.weekIndex]![editingCell.weekDayIndex]![editingCell.room] ??= []

                const roomConsults = next.consults[editingCell.weekIndex]![editingCell.weekDayIndex]![editingCell.room]!
                const timeInfo = lessonTimesFull[editingCell.lessonIndex] ?? lessonTimesFull[0]!
                roomConsults[editingCell.lessonIndex] = {
                    weekIndex: editingCell.weekIndex,
                    weekDayIndex: editingCell.weekDayIndex,
                    room: editingCell.room,
                    type: editingCell.type === "Экзамен" ? "Экзамен" : "Консультация",
                    timeStart: parseTime(timeInfo.start),
                    timeEnd: parseTime(timeInfo.end),
                    lessonStart: editingCell.lessonIndex,
                    lessonEnd: editingCell.lessonIndex,
                    teacher: editingCell.teacher,
                }

                const roomLessons = next.lessons[editingCell.weekIndex]?.[editingCell.weekDayIndex]?.[editingCell.room]
                if (roomLessons) {
                    delete roomLessons[editingCell.lessonIndex]
                }
            } else {
                next.lessons[editingCell.weekIndex] ??= []
                next.lessons[editingCell.weekIndex]![editingCell.weekDayIndex] ??= {}
                next.lessons[editingCell.weekIndex]![editingCell.weekDayIndex]![editingCell.room] ??= []

                const roomLessons = next.lessons[editingCell.weekIndex]![editingCell.weekDayIndex]![editingCell.room]!
                roomLessons[editingCell.lessonIndex] = {
                    weekIndex: editingCell.weekIndex,
                    weekDayIndex: editingCell.weekDayIndex,
                    room: editingCell.room,
                    teacher: editingCell.teacher || undefined,
                    type: editingCell.type || undefined,
                    name: "",
                    groups: "",
                    lessonIndex: editingCell.lessonIndex,
                }

                const roomConsults = next.consults[editingCell.weekIndex]?.[editingCell.weekDayIndex]?.[editingCell.room]
                if (roomConsults) {
                    delete roomConsults[editingCell.lessonIndex]
                }
            }

            return next
        })

        setIsDirty(true)
        setEditingCell((prev) => {
            if (!prev) {
                return prev
            }

            return {
                ...prev,
                entryType: prev.entryType === "lesson" ? "consult" : "lesson",
                type: prev.entryType === "lesson" ? (prev.type === "Экзамен" ? "Экзамен" : "Консультация") : prev.type,
            }
        })
    }, [editingCell])

    const saveSchedule = useCallback(async () => {
        try {
            const [admin] = await requestAdmin()

            if (!admin) {
                return
            }

            setSaveError(null)
            setSaving(true)
            const response = await fetch("/api/schedule", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(allSchedule),
            })

            console.log(response)
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            setIsDirty(false)
        } catch (e) {
            const err = e as Error
            setSaveError(err.message || "Failed to save schedule")
        } finally {
            setSaving(false)
        }
    }, [allSchedule, requestAdmin])

    const selectedDateLabel = useMemo(() => formatDate(getDateFromWeekInfo(selectedWeek, selectedWeekDay)), [selectedWeek, selectedWeekDay])

    const dayLessons = allSchedule.lessons[selectedWeek]?.[selectedWeekDay]
    const dayConsults = allSchedule.consults[selectedWeek]?.[selectedWeekDay]

    return (
        <>
            <header className={styles.header}>
                <button className={styles.loadButton} onClick={loadSelectedWeek}>
                    Загрузить
                </button>
                <button className={styles.loadButton} onClick={saveSchedule}>
                    {isSaving ? "Сохранение..." : "Сохранить"}
                </button>
                <button
                    className={styles.loadButton}
                    onClick={() => {
                        setSaveError(null)
                        loadSchedule()
                    }}
                >
                    Обновить
                </button>
                <div className={styles.dateChoosing}>
                    <input
                        className={(isWeekFaulty ? styles.faulty : "") + ` ${styles.input}`}
                        value={selectedWeekInput}
                        placeholder="Неделя"
                        name="week"
                        onChange={(e) => {
                            const rawValue = e.target.value
                            setSelectedWeekInput(rawValue)

                            const newWeek = Number(rawValue)

                            const bad = !Number.isSafeInteger(newWeek) || newWeek < 1
                            setWeekFaulty(bad)

                            if (!bad) {
                                setSelectedWeek(newWeek)
                            }
                        }}
                    />
                    <ol className={styles.daySelection}>
                        {weekDays.map((weekDay, index) => (
                            <li key={weekDay}>
                                <button className={selectedWeekDay === index ? styles.selected : ""} onClick={() => setSelectedWeekDay(index)}>
                                    {weekDay}
                                </button>
                            </li>
                        ))}
                    </ol>
                </div>
                <span className={styles.saveState}>{saveError ? `Ошибка: ${saveError}` : isDirty ? "Есть несохраненные изменения" : "Все изменения сохранены"}</span>
            </header>
            <main className={styles.main}>
                <table className={styles.table}>
                    <thead>
                        <tr className={styles.tableHeadTopRow}>
                            <th>Дата</th>
                            {lessonTimesFull.map((time) => (
                                <th colSpan={2} key={time.start}>
                                    {time.start}-{time.end}
                                </th>
                            ))}
                        </tr>
                        <tr>
                            <th>{selectedDateLabel}</th>
                            {lessonTimesFull.map((time) => (
                                <React.Fragment key={time.start}>
                                    <th>Взятие</th>
                                    <th>Сдача</th>
                                </React.Fragment>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {neededRooms.map((room) => (
                            <RoomRow
                                weekDayIndex={selectedWeekDay}
                                weekIndex={selectedWeek}
                                key={room}
                                insertHead={breakAfter.includes(room)}
                                room={room}
                                lessons={dayLessons?.[room]}
                                consults={dayConsults?.[room]}
                                onEdit={requestScheduleEdit}
                            />
                        ))}
                    </tbody>
                </table>
            </main>
            {loadingWeek !== null && (
                <div className={styles.loadingIndicator}>
                    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" />
                        <path d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z" />
                    </svg>
                    <span>Загрузка {loadingWeek} недели</span>
                </div>
            )}
            {editingCell && (
                <div className={styles.editOverlay} onClick={() => setEditingCell(null)}>
                    <div className={styles.editMenu} onClick={(e) => e.stopPropagation()}>
                        <h3>
                            {editingCell.room}, {selectedDateLabel}
                        </h3>
                        <label>
                            Преподаватель
                            <input className={styles.input} value={editingCell.teacher} onChange={(e) => setEditingCell((prev) => (prev ? { ...prev, teacher: e.target.value } : prev))} />
                        </label>
                        <label>
                            Тип
                            <input className={styles.input} value={editingCell.type} onChange={(e) => setEditingCell((prev) => (prev ? { ...prev, type: e.target.value } : prev))} />
                        </label>
                        <div className={styles.editActions}>
                            <button className={styles.loadButton} onClick={toggleEntryType}>
                                {editingCell.entryType === "lesson" ? "Сделать консультацией" : "Сделать занятием"}
                            </button>
                            {editingCell.entryType === "lesson" && (
                                <button className={styles.loadButton} onClick={clearLessonCell}>
                                    Сделать пустой
                                </button>
                            )}
                            <button className={styles.loadButton} onClick={() => setEditingCell(null)}>
                                Отмена
                            </button>
                            <button className={styles.loadButton} onClick={commitEdit}>
                                Сохранить ячейку
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

const app = (
    <StrictMode>
        <AuthProvider>
            <AlertsProvider>
                <App />
            </AlertsProvider>
        </AuthProvider>
    </StrictMode>
)

if (import.meta.hot) {
    const root = (import.meta.hot.data.root ??= createRoot(elem))
    root.render(app)
} else {
    createRoot(elem).render(app)
}
