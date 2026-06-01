import { StrictMode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Classroom } from "@/db/models/classroom"
import { Equipment as EquipmentModel } from "@/db/models/equipment"
import { PageLayout } from "../layout"
import { queryClient } from "../query"
import { alertsContext } from "../shared/alerts/AlertsProvider"
import { authContext } from "../shared/auth/AuthProvider"
import { ActionColumnDef, ColumnDef, ModifiableTable, ModifiableTableLayout, PersistedActionColumnDef } from "../shared/ModifiableTable"
import styles from "./index.module.css"
import "../global.css"

type ClassroomRow = Classroom & {
    equipmentCount?: number
}

type EquipmentCreationRow = Omit<EquipmentModel, "id">

const elem = document.getElementById("root")!
const CLASSROOM_COLUMNS_STORAGE_KEY = "classrooms.table.columns"
const defaultActionColumns: PersistedActionColumnDef[] = [{ key: "add-equipment", visible: true }]
const defaultColumns: ColumnDef<ClassroomRow>[] = [
    { key: "building", name: "Корпус", visible: true },
    { key: "floor", name: "Этаж", visible: true },
    { key: "name", name: "Название", visible: true },
    { key: "peopleCapacity", name: "Вместимость", visible: true },
    { key: "type", name: "Тип", visible: true, type: ["МА", "ТК", "ПА"] },
    { key: "additionalInfo", name: "Доп. инфа", visible: true },
    { key: "equipmentCount", name: "Кол-во оборудования", noEdit: true, noCreate: true, visible: true },
]

function normalizeEquipmentPayload(equipment: EquipmentCreationRow): EquipmentCreationRow {
    return {
        ...equipment,
        currentClassroom: equipment.currentClassroom === "" ? null : equipment.currentClassroom,
    }
}

function toClassroomPayload(room: Omit<ClassroomRow, "equipmentCount">): Classroom {
    const { equipmentCount, ...payload } = room
    return payload as Classroom
}

function buildEquipmentColumns(classrooms: ClassroomRow[]): ColumnDef<EquipmentCreationRow>[] {
    return [
        { key: "name", name: "Название", visible: true },
        { key: "identifier", name: "Инвентарный номер", visible: true },
        {
            key: "currentClassroom",
            name: "Кабинет",
            visible: true,
            type: ["", ...classrooms.map((room) => String(room.id))],
        },
    ]
}

function restoreStoredColumns(parsed: unknown): ColumnDef<ClassroomRow>[] {
    if (!Array.isArray(parsed)) return defaultColumns

    const defaultsByKey = new Map(defaultColumns.map((column) => [String(column.key), column]))
    const restoredColumns = parsed
        .filter((column): column is Partial<ColumnDef<ClassroomRow>> & { key: string } => typeof column === "object" && column !== null && typeof column.key === "string")
        .map((column) => {
            const defaultColumn = defaultsByKey.get(column.key)

            if (defaultColumn) {
                return {
                    ...defaultColumn,
                    ...column,
                    key: defaultColumn.key,
                }
            }

            return {
                key: column.key as keyof ClassroomRow,
                name: typeof column.name === "string" && column.name.trim() !== "" ? column.name : column.key,
                visible: column.visible !== false,
                noEdit: column.noEdit,
                noCreate: column.noCreate,
                type: column.type,
            }
        })

    const restoredKeys = new Set(restoredColumns.map((column) => String(column.key)))
    const missingDefaults = defaultColumns.filter((column) => !restoredKeys.has(String(column.key)))

    return [...restoredColumns, ...missingDefaults]
}

function loadStoredLayout(): ModifiableTableLayout<ClassroomRow> {
    try {
        const raw = localStorage.getItem(CLASSROOM_COLUMNS_STORAGE_KEY)
        if (!raw) {
            return {
                columns: defaultColumns,
                actionColumns: defaultActionColumns,
                columnOrder: [],
            }
        }

        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
            return {
                columns: restoreStoredColumns(parsed),
                actionColumns: defaultActionColumns,
                columnOrder: [],
            }
        }

        if (typeof parsed !== "object" || parsed === null) {
            return {
                columns: defaultColumns,
                actionColumns: defaultActionColumns,
                columnOrder: [],
            }
        }

        const parsedLayout = parsed as {
            columns?: unknown
            actionColumns?: unknown
            columnOrder?: unknown
        }

        return {
            columns: restoreStoredColumns(parsedLayout.columns),
            actionColumns: Array.isArray(parsedLayout.actionColumns)
                ? parsedLayout.actionColumns
                      .filter((column: unknown): column is PersistedActionColumnDef => typeof column === "object" && column !== null && typeof (column as PersistedActionColumnDef).key === "string")
                      .map((column) => ({
                          key: column.key,
                          visible: column.visible !== false,
                      }))
                : defaultActionColumns,
            columnOrder: Array.isArray(parsedLayout.columnOrder) ? parsedLayout.columnOrder.filter((id: unknown): id is string => typeof id === "string") : [],
        }
    } catch {
        return {
            columns: defaultColumns,
            actionColumns: defaultActionColumns,
            columnOrder: [],
        }
    }
}

function App() {
    const { showAlert } = useContext(alertsContext)
    const { requestAdmin } = useContext(authContext)
    const [initialLayout] = useState<ModifiableTableLayout<ClassroomRow>>(loadStoredLayout)
    const [columns, setColumns] = useState<ColumnDef<ClassroomRow>[]>(() => initialLayout.columns)
    const [storedActionColumns, setStoredActionColumns] = useState<PersistedActionColumnDef[]>(() => initialLayout.actionColumns)
    const [columnOrder, setColumnOrder] = useState<string[]>(() => initialLayout.columnOrder)
    const [pendingEquipmentClassroomId, setPendingEquipmentClassroomId] = useState<number | null>(null)

    useEffect(() => {
        localStorage.setItem(
            CLASSROOM_COLUMNS_STORAGE_KEY,
            JSON.stringify({
                columns,
                actionColumns: storedActionColumns,
                columnOrder,
            } satisfies ModifiableTableLayout<ClassroomRow>),
        )
    }, [columnOrder, columns, storedActionColumns])

    const { data: roomData } = useQuery({
        queryKey: ["rooms"],
        queryFn: async () => {
            const response = await fetch("/api/classrooms/getAll")
            return await response.json()
        },
    })

    const deleteClassroom = useMutation({
        mutationFn: async (id: string | number) => {
            const [admin] = await requestAdmin()

            if (admin) {
                await fetch("/api/classrooms/delete/" + id, {
                    method: "DELETE",
                }).catch((e) => {
                    showAlert(e.message, { type: "error" })
                })
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["rooms"] })
        },
    })

    const createClassroom = useMutation({
        mutationFn: async (room: Omit<ClassroomRow, "id">) => {
            const [admin] = await requestAdmin()

            if (admin) {
                await fetch("/api/classrooms/create", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(toClassroomPayload(room)),
                }).catch((e) => {
                    showAlert(e.message, { type: "error" })
                })
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["rooms"] })
        },
    })

    const editClassroom = useMutation({
        mutationFn: async (room: ClassroomRow) => {
            const [admin] = await requestAdmin()

            if (admin) {
                await fetch("/api/classrooms/edit", {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(toClassroomPayload(room)),
                }).catch((e) => {
                    showAlert(e.message, { type: "error" })
                })
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["rooms"] })
        },
    })

    const createEquipment = useMutation({
        mutationFn: async (equipment: EquipmentCreationRow) => {
            const [admin] = await requestAdmin()

            if (admin) {
                await fetch("/api/equipment/create", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(equipment),
                }).catch((e) => {
                    showAlert(e.message, { type: "error" })
                })
            }
        },
        onSuccess: () => {
            setPendingEquipmentClassroomId(null)
            queryClient.invalidateQueries({ queryKey: ["equipment"] })
            queryClient.invalidateQueries({ queryKey: ["rooms"] })
        },
    })

    const rooms = ((roomData as { keys: string[]; classrooms: ClassroomRow[] } | undefined)?.classrooms ?? []) as ClassroomRow[]
    const equipmentColumns = useMemo(() => buildEquipmentColumns(rooms), [rooms])
    const equipmentDefaults = useMemo<Partial<EquipmentCreationRow> | undefined>(() => {
        if (pendingEquipmentClassroomId === null) return undefined

        return {
            name: "",
            identifier: "",
            currentClassroom: pendingEquipmentClassroomId,
        }
    }, [pendingEquipmentClassroomId])

    const equipmentActionColumns: ActionColumnDef<ClassroomRow>[] = useMemo(
        () => [
            {
                key: "add-equipment",
                name: "Оборудование",
                visible: storedActionColumns.find((column) => column.key === "add-equipment")?.visible ?? true,
                render: (room) => (
                    <button
                        type="button"
                        className={styles.addEquipmentButton}
                        onClick={() => {
                            setPendingEquipmentClassroomId(room.id)
                        }}
                    >
                        Добавить
                    </button>
                ),
            },
        ],
        [storedActionColumns],
    )

    const handleLayoutChange = useCallback((layout: ModifiableTableLayout<ClassroomRow>) => {
        setStoredActionColumns(layout.actionColumns)
        setColumnOrder(layout.columnOrder)
    }, [])

    if (!roomData) {
        return <div></div>
    }

    return (
        <div className={styles.classroomTableWrapper}>
            {rooms ? (
                <>
                    <ModifiableTable
                        rowData={rooms}
                        onCreate={(room) => {
                            createClassroom.mutate(room)
                        }}
                        onDelete={(room) => {
                            deleteClassroom.mutate(room.id)
                        }}
                        onEdit={(room) => {
                            editClassroom.mutate(room)
                        }}
                        allowEdit={true}
                        defaultSort={{ dataKey: "name", ascending: true }}
                        columns={columns}
                        actionColumns={equipmentActionColumns}
                        initialColumnOrder={columnOrder}
                        onColumnsChange={setColumns}
                        onLayoutChange={handleLayoutChange}
                    />
                    {pendingEquipmentClassroomId !== null && (
                        <div className={styles.equipmentAttachSection}>
                            <div className={styles.equipmentAttachHeader}>
                                Добавление оборудования в кабинет {rooms.find((room) => room.id === pendingEquipmentClassroomId)?.name ?? `#${pendingEquipmentClassroomId}`}
                            </div>
                            <ModifiableTable
                                rowData={[] as EquipmentCreationRow[]}
                                onCreate={(equipment) => {
                                    createEquipment.mutate(normalizeEquipmentPayload(equipment as EquipmentCreationRow))
                                }}
                                allowEdit={true}
                                columns={equipmentColumns}
                                creatingRowDefaults={equipmentDefaults}
                                startWithCreatingRow={true}
                                onCreationCancel={() => {
                                    setPendingEquipmentClassroomId(null)
                                }}
                            />
                        </div>
                    )}
                </>
            ) : null}
        </div>
    )
}

if (import.meta.hot) {
    const root = (import.meta.hot.data.root ??= createRoot(elem))
    root.render(
        <StrictMode>
            <PageLayout>
                <App />
            </PageLayout>
        </StrictMode>,
    )
} else {
    createRoot(elem).render(
        <StrictMode>
            <PageLayout>
                <App />
            </PageLayout>
        </StrictMode>,
    )
}
